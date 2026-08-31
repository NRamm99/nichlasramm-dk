create table public.matchmaker_listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  note text,
  host_seats smallint not null check (host_seats in (1, 2)),
  brought_partner_id uuid references public.profiles (id) on delete restrict,
  status text not null default 'open' check (status in ('open', 'closed', 'converted')),
  converted_match_id uuid unique references public.matches (id) on delete set null,
  constraint matchmaker_listings_window check (
    ends_at > starts_at
    and ends_at <= starts_at + interval '8 hours'
  ),
  constraint matchmaker_listings_partner check (
    (host_seats = 1 and brought_partner_id is null)
    or (host_seats = 2 and brought_partner_id is not null and brought_partner_id <> host_id)
  )
);

create table public.matchmaker_rsvps (
  listing_id uuid not null references public.matchmaker_listings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('going', 'interested', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (listing_id, profile_id)
);

create table public.matchmaker_listing_messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.matchmaker_listings (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.matchmaker_listing_reads (
  listing_id uuid not null references public.matchmaker_listings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (listing_id, profile_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index matchmaker_listings_open_idx
  on public.matchmaker_listings (starts_at)
  where status = 'open';
create index matchmaker_rsvps_listing_idx
  on public.matchmaker_rsvps (listing_id, status);
create index matchmaker_messages_listing_idx
  on public.matchmaker_listing_messages (listing_id, created_at);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

alter table public.matchmaker_listings enable row level security;
alter table public.matchmaker_rsvps enable row level security;
alter table public.matchmaker_listing_messages enable row level security;
alter table public.matchmaker_listing_reads enable row level security;
alter table public.notifications enable row level security;

revoke all on public.matchmaker_listings from anon, authenticated;
revoke all on public.matchmaker_rsvps from anon, authenticated;
revoke all on public.matchmaker_listing_messages from anon, authenticated;
revoke all on public.matchmaker_listing_reads from anon, authenticated;
revoke all on public.notifications from anon, authenticated;

grant select on public.matchmaker_listings to authenticated;
grant select on public.matchmaker_rsvps to authenticated;
grant select on public.matchmaker_listing_messages to authenticated;
grant select on public.matchmaker_listing_reads to authenticated;
grant select on public.notifications to authenticated;

drop policy if exists matchmaker_listings_select on public.matchmaker_listings;
create policy matchmaker_listings_select
  on public.matchmaker_listings for select to authenticated
  using (private.is_active_member());

drop policy if exists matchmaker_rsvps_select on public.matchmaker_rsvps;
create policy matchmaker_rsvps_select
  on public.matchmaker_rsvps for select to authenticated
  using (private.is_active_member());

drop policy if exists matchmaker_messages_select on public.matchmaker_listing_messages;
create policy matchmaker_messages_select
  on public.matchmaker_listing_messages for select to authenticated
  using (private.is_active_member());

drop policy if exists matchmaker_reads_select_own on public.matchmaker_listing_reads;
create policy matchmaker_reads_select_own
  on public.matchmaker_listing_reads for select to authenticated
  using (profile_id = (select auth.uid()) and private.is_active_member());

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and private.is_active_member());

create or replace function private.notify(
  p_recipient uuid,
  p_kind text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or p_recipient = auth.uid() then
    return;
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_recipient and banned_at is null
  ) then
    return;
  end if;
  insert into public.notifications (recipient_id, kind, payload)
  values (p_recipient, p_kind, coalesce(p_payload, '{}'::jsonb));
end;
$$;

create or replace function private.matchmaker_occupied(p_listing_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select l.host_seats + coalesce((
    select count(*)::integer
    from public.matchmaker_rsvps r
    where r.listing_id = l.id
      and r.status = 'going'
      and r.profile_id <> l.host_id
      and r.profile_id is distinct from l.brought_partner_id
  ), 0)
  from public.matchmaker_listings l
  where l.id = p_listing_id;
$$;

create or replace function private.matchmaker_is_chat_member(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.matchmaker_listings l
    where l.id = p_listing_id
      and (
        l.host_id = auth.uid()
        or l.brought_partner_id = auth.uid()
        or exists (
          select 1 from public.matchmaker_rsvps r
          where r.listing_id = l.id
            and r.profile_id = auth.uid()
            and r.status in ('going', 'interested')
        )
      )
  );
$$;

create or replace function private.matchmaker_thread_ids(p_listing_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.host_id
  from public.matchmaker_listings l
  where l.id = p_listing_id
  union
  select l.brought_partner_id
  from public.matchmaker_listings l
  where l.id = p_listing_id and l.brought_partner_id is not null
  union
  select r.profile_id
  from public.matchmaker_rsvps r
  where r.listing_id = p_listing_id
    and r.status in ('going', 'interested');
$$;

create or replace function private.matchmaker_assert_host(p_listing_id uuid)
returns public.matchmaker_listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing public.matchmaker_listings%rowtype;
begin
  if auth.uid() is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into listing from public.matchmaker_listings where id = p_listing_id;
  if listing.id is null then
    raise exception 'LISTING_NOT_FOUND';
  end if;
  if listing.host_id <> auth.uid() then
    raise exception 'NOT_LISTING_HOST';
  end if;
  return listing;
end;
$$;

create or replace function private.create_matchmaker_listing(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text,
  p_note text,
  p_partner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  new_id uuid;
  seats smallint;
  loc text;
  note text;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_starts_at is null or p_ends_at is null then
    raise exception 'INVALID_WHEN';
  end if;
  if p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '8 hours' then
    raise exception 'WINDOW_TOO_LONG';
  end if;
  if p_ends_at <= now() then
    raise exception 'INVALID_WHEN';
  end if;

  loc := nullif(left(trim(coalesce(p_location, '')), 120), '');
  note := nullif(left(trim(coalesce(p_note, '')), 500), '');

  if p_partner_id is not null then
    if p_partner_id = current_id then
      raise exception 'CANNOT_PARTNER_SELF';
    end if;
    if not exists (
      select 1 from public.profiles
      where id = p_partner_id and banned_at is null
    ) then
      raise exception 'MEMBER_NOT_FOUND';
    end if;
    seats := 2;
  else
    seats := 1;
  end if;

  insert into public.matchmaker_listings (
    host_id, starts_at, ends_at, location, note, host_seats, brought_partner_id
  )
  values (current_id, p_starts_at, p_ends_at, loc, note, seats, p_partner_id)
  returning id into new_id;

  if p_partner_id is not null then
    perform private.notify(
      p_partner_id,
      'matchmaker_rsvp',
      jsonb_build_object('listing_id', new_id, 'href', '/matchmaker/' || new_id)
    );
  end if;

  return new_id;
end;
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
  occupied integer;
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

  if p_status = 'going' and previous is distinct from 'going' then
    occupied := private.matchmaker_occupied(p_listing_id);
    if occupied >= 4 then
      raise exception 'LISTING_FULL';
    end if;
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

create or replace function private.close_matchmaker_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing public.matchmaker_listings%rowtype;
  recipient uuid;
begin
  listing := private.matchmaker_assert_host(p_listing_id);
  if listing.status <> 'open' then
    raise exception 'LISTING_CLOSED';
  end if;

  update public.matchmaker_listings
  set status = 'closed'
  where id = p_listing_id;

  for recipient in
    select * from private.matchmaker_thread_ids(p_listing_id)
  loop
    perform private.notify(
      recipient,
      'matchmaker_closed',
      jsonb_build_object('listing_id', p_listing_id, 'href', '/matchmaker/' || p_listing_id)
    );
  end loop;
end;
$$;

create or replace function private.add_matchmaker_message(
  p_listing_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing public.matchmaker_listings%rowtype;
  current_id uuid;
  new_id uuid;
  cleaned text;
  recipient uuid;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select * into listing from public.matchmaker_listings where id = p_listing_id;
  if listing.id is null then
    raise exception 'LISTING_NOT_FOUND';
  end if;
  if listing.status <> 'open' or listing.ends_at <= now() then
    raise exception 'LISTING_CLOSED';
  end if;
  if not private.matchmaker_is_chat_member(p_listing_id) then
    raise exception 'NOT_CHAT_MEMBER';
  end if;

  cleaned := left(trim(coalesce(p_body, '')), 1000);
  if cleaned = '' then
    raise exception 'COMMENT_REQUIRED';
  end if;

  insert into public.matchmaker_listing_messages (listing_id, author_id, body)
  values (p_listing_id, current_id, cleaned)
  returning id into new_id;

  for recipient in
    select * from private.matchmaker_thread_ids(p_listing_id)
  loop
    perform private.notify(
      recipient,
      'matchmaker_message',
      jsonb_build_object('listing_id', p_listing_id, 'href', '/matchmaker/' || p_listing_id)
    );
  end loop;

  return new_id;
end;
$$;

create or replace function private.mark_matchmaker_listing_read(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not exists (select 1 from public.matchmaker_listings where id = p_listing_id) then
    raise exception 'LISTING_NOT_FOUND';
  end if;
  if not private.matchmaker_is_chat_member(p_listing_id) then
    raise exception 'NOT_CHAT_MEMBER';
  end if;
  insert into public.matchmaker_listing_reads (listing_id, profile_id, last_read_at)
  values (p_listing_id, auth.uid(), now())
  on conflict (listing_id, profile_id)
  do update set last_read_at = now();
end;
$$;

create or replace function private.convert_matchmaker_listing(
  p_listing_id uuid,
  p_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing public.matchmaker_listings%rowtype;
  recipient uuid;
  expected uuid[];
  actual uuid[];
begin
  listing := private.matchmaker_assert_host(p_listing_id);
  if listing.status = 'converted' then
    raise exception 'LISTING_ALREADY_CONVERTED';
  end if;
  if listing.status <> 'open' then
    raise exception 'LISTING_CLOSED';
  end if;
  if private.matchmaker_occupied(p_listing_id) <> 4 then
    raise exception 'LISTING_NOT_FULL';
  end if;

  if not exists (
    select 1 from public.matches
    where id = p_match_id
      and created_by = listing.host_id
      and status = 'scheduled'
  ) then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  select coalesce(array_agg(profile_id order by profile_id), '{}')
  into actual
  from public.match_players
  where match_id = p_match_id
    and profile_id is not null;

  expected := array(
    select distinct u
    from unnest(
      array[listing.host_id, listing.brought_partner_id] || coalesce((
        select array_agg(r.profile_id)
        from public.matchmaker_rsvps r
        where r.listing_id = p_listing_id and r.status = 'going'
      ), '{}'::uuid[])
    ) as u
    where u is not null
    order by 1
  );

  if actual is distinct from expected then
    raise exception 'PLAYER_REQUIRED';
  end if;
  if array_length(expected, 1) <> 4 then
    raise exception 'LISTING_NOT_FULL';
  end if;

  update public.matchmaker_listings
  set status = 'converted', converted_match_id = p_match_id
  where id = p_listing_id;

  for recipient in
    select * from private.matchmaker_thread_ids(p_listing_id)
  loop
    perform private.notify(
      recipient,
      'matchmaker_converted',
      jsonb_build_object(
        'listing_id', p_listing_id,
        'match_id', p_match_id,
        'href', '/kampe/' || p_match_id
      )
    );
  end loop;
end;
$$;

create or replace function private.mark_notification_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  update public.notifications
  set read_at = now()
  where id = p_id
    and recipient_id = auth.uid()
    and read_at is null;
end;
$$;

create or replace function private.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  update public.notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null;
end;
$$;

create or replace function public.create_matchmaker_listing(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text,
  p_note text,
  p_partner_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_matchmaker_listing(
    p_starts_at, p_ends_at, p_location, p_note, p_partner_id
  );
$$;

create or replace function public.set_matchmaker_rsvp(p_listing_id uuid, p_status text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_matchmaker_rsvp(p_listing_id, p_status);
$$;

create or replace function public.remove_matchmaker_player(
  p_listing_id uuid,
  p_profile_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.remove_matchmaker_player(p_listing_id, p_profile_id);
$$;

create or replace function public.close_matchmaker_listing(p_listing_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.close_matchmaker_listing(p_listing_id);
$$;

create or replace function public.add_matchmaker_message(p_listing_id uuid, p_body text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.add_matchmaker_message(p_listing_id, p_body);
$$;

create or replace function public.mark_matchmaker_listing_read(p_listing_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_matchmaker_listing_read(p_listing_id);
$$;

create or replace function public.convert_matchmaker_listing(
  p_listing_id uuid,
  p_match_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.convert_matchmaker_listing(p_listing_id, p_match_id);
$$;

create or replace function public.mark_notification_read(p_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_notification_read(p_id);
$$;

create or replace function public.mark_all_notifications_read()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_all_notifications_read();
$$;

grant execute on function private.notify(uuid, text, jsonb) to authenticated;
grant execute on function private.matchmaker_occupied(uuid) to authenticated;
grant execute on function private.matchmaker_is_chat_member(uuid) to authenticated;
grant execute on function private.matchmaker_thread_ids(uuid) to authenticated;
grant execute on function private.matchmaker_assert_host(uuid) to authenticated;
grant execute on function private.create_matchmaker_listing(timestamptz, timestamptz, text, text, uuid) to authenticated;
grant execute on function private.set_matchmaker_rsvp(uuid, text) to authenticated;
grant execute on function private.remove_matchmaker_player(uuid, uuid) to authenticated;
grant execute on function private.close_matchmaker_listing(uuid) to authenticated;
grant execute on function private.add_matchmaker_message(uuid, text) to authenticated;
grant execute on function private.mark_matchmaker_listing_read(uuid) to authenticated;
grant execute on function private.convert_matchmaker_listing(uuid, uuid) to authenticated;
grant execute on function private.mark_notification_read(uuid) to authenticated;
grant execute on function private.mark_all_notifications_read() to authenticated;
grant execute on function public.create_matchmaker_listing(timestamptz, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.set_matchmaker_rsvp(uuid, text) to authenticated;
grant execute on function public.remove_matchmaker_player(uuid, uuid) to authenticated;
grant execute on function public.close_matchmaker_listing(uuid) to authenticated;
grant execute on function public.add_matchmaker_message(uuid, text) to authenticated;
grant execute on function public.mark_matchmaker_listing_read(uuid) to authenticated;
grant execute on function public.convert_matchmaker_listing(uuid, uuid) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function private.add_match_comment(p_match_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  new_id uuid;
  cleaned text;
  recipient uuid;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (select 1 from public.matches where id = p_match_id) then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if not private.is_match_participant(p_match_id) then
    raise exception 'NOT_MATCH_PLAYER';
  end if;

  cleaned := left(trim(coalesce(p_body, '')), 1000);
  if cleaned = '' then
    raise exception 'COMMENT_REQUIRED';
  end if;

  insert into public.match_comments (match_id, author_id, body)
  values (p_match_id, current_id, cleaned)
  returning id into new_id;

  for recipient in
    select distinct profile_id
    from public.match_players
    where match_id = p_match_id and profile_id is not null
  loop
    perform private.notify(
      recipient,
      'match_comment',
      jsonb_build_object('match_id', p_match_id, 'href', '/kampe/' || p_match_id)
    );
  end loop;

  return new_id;
end;
$$;

create or replace function private.add_league_message(p_fixture_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  new_id uuid;
  cleaned text;
  recipient uuid;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (select 1 from public.league_fixtures where id = p_fixture_id) then
    raise exception 'FIXTURE_NOT_FOUND';
  end if;

  if not private.is_league_fixture_player(p_fixture_id) then
    raise exception 'NOT_FIXTURE_PLAYER';
  end if;

  cleaned := left(trim(coalesce(p_body, '')), 1000);
  if cleaned = '' then
    raise exception 'COMMENT_REQUIRED';
  end if;

  insert into public.league_fixture_messages (fixture_id, author_id, body)
  values (p_fixture_id, current_id, cleaned)
  returning id into new_id;

  for recipient in
    select p.profile_id
    from public.league_fixtures f
    join public.league_team_players p on p.team_id in (f.team_a_id, f.team_b_id)
    where f.id = p_fixture_id
  loop
    perform private.notify(
      recipient,
      'league_message',
      jsonb_build_object('fixture_id', p_fixture_id, 'href', '/liga')
    );
  end loop;

  return new_id;
end;
$$;

create or replace function private.request_partnership(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  existing_id uuid;
  reverse_id uuid;
begin
  current_id := private.require_self();

  if p_user_id is null or p_user_id = current_id then
    raise exception 'CANNOT_PARTNER_SELF';
  end if;

  perform private.lock_profile_pair(current_id, p_user_id);

  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
      and banned_at is null
  ) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.profiles where id = current_id and partner_id is not null
  ) then
    raise exception 'HAS_PARTNER';
  end if;

  if exists (
    select 1 from public.profiles where id = p_user_id and partner_id is not null
  ) then
    raise exception 'TARGET_HAS_PARTNER';
  end if;

  select id
  into reverse_id
  from public.partnership_requests
  where requester_id = p_user_id
    and recipient_id = current_id;

  if reverse_id is not null then
    perform private.form_partnership(current_id, p_user_id);
    return reverse_id;
  end if;

  begin
    insert into public.partnership_requests (requester_id, recipient_id)
    values (current_id, p_user_id)
    returning id into existing_id;
  exception
    when unique_violation then
      raise exception 'ALREADY_REQUESTED';
  end;

  perform private.notify(
    p_user_id,
    'partnership_request',
    jsonb_build_object('href', '/profil')
  );

  return existing_id;
end;
$$;
