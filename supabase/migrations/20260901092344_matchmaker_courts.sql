create table public.matchmaker_listing_matches (
  listing_id uuid not null references public.matchmaker_listings (id) on delete cascade,
  court_number smallint not null check (court_number >= 1),
  match_id uuid not null unique references public.matches (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, court_number)
);

create index matchmaker_listing_matches_listing_idx
  on public.matchmaker_listing_matches (listing_id);

alter table public.matchmaker_listing_matches enable row level security;

revoke all on public.matchmaker_listing_matches from anon, authenticated;
grant select on public.matchmaker_listing_matches to authenticated;

drop policy if exists matchmaker_listing_matches_select on public.matchmaker_listing_matches;
create policy matchmaker_listing_matches_select
  on public.matchmaker_listing_matches for select to authenticated
  using (private.is_active_member());

create or replace function private.matchmaker_going_ids(p_listing_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select array_remove(
      array[l.host_id, l.brought_partner_id]
        || coalesce((
          select array_agg(r.profile_id order by r.created_at, r.profile_id)
          from public.matchmaker_rsvps r
          where r.listing_id = l.id
            and r.status = 'going'
            and r.profile_id <> l.host_id
            and r.profile_id is distinct from l.brought_partner_id
        ), '{}'::uuid[]),
      null
    )
    from public.matchmaker_listings l
    where l.id = p_listing_id
  ), '{}'::uuid[]);
$$;

create or replace function private.matchmaker_court_ids(
  p_listing_id uuid,
  p_court integer
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (private.matchmaker_going_ids(p_listing_id))[
      ((p_court - 1) * 4 + 1):(p_court * 4)
    ],
    '{}'::uuid[]
  );
$$;

create or replace function private.matchmaker_assigned_ids(p_listing_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct p.profile_id), '{}'::uuid[])
  from public.matchmaker_listing_matches m
  join public.match_players p on p.match_id = m.match_id
  where m.listing_id = p_listing_id
    and p.profile_id is not null;
$$;

create or replace function private.set_matchmaker_rsvp(
  p_listing_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing public.matchmaker_listings%rowtype;
  current_id uuid;
  previous text;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_status not in ('going', 'interested', 'declined') then
    raise exception 'INVALID_RSVP';
  end if;

  select * into listing from public.matchmaker_listings where id = p_listing_id;
  if listing.id is null then
    raise exception 'LISTING_NOT_FOUND';
  end if;
  if listing.status <> 'open' or listing.ends_at <= now() then
    raise exception 'LISTING_CLOSED';
  end if;
  if current_id = listing.host_id or current_id = listing.brought_partner_id then
    raise exception 'CANNOT_RSVP_OWN';
  end if;

  select r.status into previous
  from public.matchmaker_rsvps r
  where r.listing_id = p_listing_id and r.profile_id = current_id;

  if previous = 'going'
     and p_status is distinct from 'going'
     and current_id = any (private.matchmaker_assigned_ids(p_listing_id)) then
    raise exception 'CANNOT_LEAVE_COURT';
  end if;

  insert into public.matchmaker_rsvps (listing_id, profile_id, status)
  values (p_listing_id, current_id, p_status)
  on conflict (listing_id, profile_id)
  do update set status = excluded.status, updated_at = now();

  if previous is distinct from p_status then
    perform private.notify(
      listing.host_id,
      'matchmaker_rsvp',
      jsonb_build_object('listing_id', p_listing_id, 'href', '/matchmaker/' || p_listing_id)
    );
  end if;
end;
$$;

create or replace function private.remove_matchmaker_player(
  p_listing_id uuid,
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing public.matchmaker_listings%rowtype;
begin
  listing := private.matchmaker_assert_host(p_listing_id);
  if listing.status <> 'open' then
    raise exception 'LISTING_CLOSED';
  end if;
  if p_profile_id = listing.host_id or p_profile_id = listing.brought_partner_id then
    raise exception 'CANNOT_REMOVE_HOST';
  end if;
  if p_profile_id = any (private.matchmaker_assigned_ids(p_listing_id)) then
    raise exception 'CANNOT_LEAVE_COURT';
  end if;

  update public.matchmaker_rsvps
  set status = 'declined', updated_at = now()
  where listing_id = p_listing_id
    and profile_id = p_profile_id
    and status = 'going';

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  perform private.notify(
    p_profile_id,
    'matchmaker_removed',
    jsonb_build_object('listing_id', p_listing_id, 'href', '/matchmaker/' || p_listing_id)
  );
end;
$$;

create or replace function private.create_matchmaker_court_match(
  p_listing_id uuid,
  p_court integer,
  p_played_at timestamptz,
  p_players uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing public.matchmaker_listings%rowtype;
  expected uuid[];
  actual uuid[];
  new_id uuid;
  recipient uuid;
begin
  listing := private.matchmaker_assert_host(p_listing_id);
  if listing.status <> 'open' or listing.ends_at <= now() then
    raise exception 'LISTING_CLOSED';
  end if;
  if p_court is null or p_court < 1 then
    raise exception 'INVALID_COURT';
  end if;
  if p_played_at is null or p_played_at < now() - interval '15 minutes' then
    raise exception 'INVALID_WHEN';
  end if;

  expected := private.matchmaker_court_ids(p_listing_id, p_court);
  if coalesce(cardinality(expected), 0) <> 4 then
    raise exception 'LISTING_NOT_FULL';
  end if;

  if exists (
    select 1 from public.matchmaker_listing_matches
    where listing_id = p_listing_id and court_number = p_court
  ) then
    raise exception 'COURT_ALREADY_MATCHED';
  end if;

  if exists (
    select 1
    from unnest(expected) as uid
    where uid = any (private.matchmaker_assigned_ids(p_listing_id))
  ) then
    raise exception 'COURT_ALREADY_MATCHED';
  end if;

  actual := array(
    select distinct u from unnest(p_players) as u where u is not null order by 1
  );
  if actual is distinct from (
    select array(select unnest(expected) order by 1)
  ) then
    raise exception 'PLAYER_REQUIRED';
  end if;
  if coalesce(cardinality(p_players), 0) <> 4 then
    raise exception 'PLAYER_REQUIRED';
  end if;

  insert into public.matches (created_by, played_at, status)
  values (listing.host_id, p_played_at, 'scheduled')
  returning id into new_id;

  perform private.insert_match_player(
    new_id, 1, 1, jsonb_build_object('profile_id', p_players[1])
  );
  perform private.insert_match_player(
    new_id, 1, 2, jsonb_build_object('profile_id', p_players[2])
  );
  perform private.insert_match_player(
    new_id, 2, 1, jsonb_build_object('profile_id', p_players[3])
  );
  perform private.insert_match_player(
    new_id, 2, 2, jsonb_build_object('profile_id', p_players[4])
  );

  insert into public.matchmaker_listing_matches (listing_id, court_number, match_id)
  values (p_listing_id, p_court, new_id);

  for recipient in
    select * from private.matchmaker_thread_ids(p_listing_id)
  loop
    perform private.notify(
      recipient,
      'matchmaker_converted',
      jsonb_build_object(
        'listing_id', p_listing_id,
        'match_id', new_id,
        'href', '/kampe/' || new_id
      )
    );
  end loop;

  return new_id;
end;
$$;

create or replace function public.create_matchmaker_court_match(
  p_listing_id uuid,
  p_court integer,
  p_played_at timestamptz,
  p_players uuid[]
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_matchmaker_court_match(
    p_listing_id, p_court, p_played_at, p_players
  );
$$;

grant execute on function private.matchmaker_going_ids(uuid) to authenticated;
grant execute on function private.matchmaker_court_ids(uuid, integer) to authenticated;
grant execute on function private.matchmaker_assigned_ids(uuid) to authenticated;
grant execute on function private.create_matchmaker_court_match(uuid, integer, timestamptz, uuid[]) to authenticated;
grant execute on function public.create_matchmaker_court_match(uuid, integer, timestamptz, uuid[]) to authenticated;
