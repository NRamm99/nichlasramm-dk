create table if not exists public.league_join_requests (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint league_join_requests_not_self check (requester_id <> recipient_id)
);

create unique index if not exists league_join_requests_pair_key
  on public.league_join_requests (
    league_id,
    least(requester_id, recipient_id),
    greatest(requester_id, recipient_id)
  );

create index if not exists league_join_requests_recipient_idx
  on public.league_join_requests (league_id, recipient_id);

alter table public.league_join_requests enable row level security;

revoke all on public.league_join_requests from anon, authenticated;
grant select on public.league_join_requests to authenticated;

drop policy if exists league_join_requests_select_involved on public.league_join_requests;
create policy league_join_requests_select_involved
  on public.league_join_requests
  for select
  to authenticated
  using (
    requester_id = (select auth.uid())
    or recipient_id = (select auth.uid())
  );

create or replace function private.assert_league_signup_ok(
  p_league_id uuid,
  p_partner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_partner_id is null or p_partner_id = current_id then
    raise exception 'LEAGUE_PARTNER_REQUIRED';
  end if;

  if not exists (
    select 1 from public.leagues where id = p_league_id
  ) then
    raise exception 'LEAGUE_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.leagues
    where id = p_league_id and signup_deadline < now()
  ) then
    raise exception 'SIGNUP_CLOSED';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_partner_id and banned_at is null
  ) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.league_team_players
    where league_id = p_league_id and profile_id = current_id
  ) then
    raise exception 'ALREADY_IN_LEAGUE';
  end if;

  if exists (
    select 1 from public.league_team_players
    where league_id = p_league_id and profile_id = p_partner_id
  ) then
    raise exception 'PARTNER_IN_LEAGUE';
  end if;

  return current_id;
end;
$$;

create or replace function private.clear_league_join_requests(
  p_league_id uuid,
  p_a uuid,
  p_b uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.league_join_requests
  where league_id = p_league_id
    and (
      requester_id in (p_a, p_b)
      or recipient_id in (p_a, p_b)
    );
end;
$$;

create or replace function private.join_league(p_league_id uuid, p_partner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  new_team uuid;
  other_team uuid;
begin
  current_id := private.assert_league_signup_ok(p_league_id, p_partner_id);

  insert into public.league_teams (league_id, created_by)
  values (p_league_id, current_id)
  returning id into new_team;

  insert into public.league_team_players (league_id, team_id, profile_id, slot)
  values
    (p_league_id, new_team, current_id, 1),
    (p_league_id, new_team, p_partner_id, 2);

  for other_team in
    select id from public.league_teams
    where league_id = p_league_id and id <> new_team
  loop
    insert into public.league_fixtures (league_id, team_a_id, team_b_id)
    values (
      p_league_id,
      least(new_team, other_team),
      greatest(new_team, other_team)
    );
  end loop;

  perform private.clear_league_join_requests(p_league_id, current_id, p_partner_id);

  return new_team;
end;
$$;

create or replace function private.request_league_join(p_league_id uuid, p_partner_id uuid)
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
  current_id := private.assert_league_signup_ok(p_league_id, p_partner_id);

  select id
  into reverse_id
  from public.league_join_requests
  where league_id = p_league_id
    and requester_id = p_partner_id
    and recipient_id = current_id;

  if reverse_id is not null then
    perform private.join_league(p_league_id, p_partner_id);
    return reverse_id;
  end if;

  if exists (
    select 1
    from public.league_join_requests
    where league_id = p_league_id
      and requester_id = current_id
  ) then
    raise exception 'ALREADY_REQUESTED';
  end if;

  begin
    insert into public.league_join_requests (league_id, requester_id, recipient_id)
    values (p_league_id, current_id, p_partner_id)
    returning id into existing_id;
  exception
    when unique_violation then
      raise exception 'ALREADY_REQUESTED';
  end;

  return existing_id;
end;
$$;

create or replace function private.accept_league_join(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  from_id uuid;
  to_id uuid;
  req_league uuid;
  new_team uuid;
begin
  current_id := private.require_self();

  select r.league_id, r.requester_id, r.recipient_id
  into req_league, from_id, to_id
  from public.league_join_requests as r
  where r.id = p_request_id;

  if from_id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if to_id <> current_id then
    raise exception 'NOT_RECIPIENT';
  end if;

  new_team := private.join_league(req_league, from_id);
  return new_team;
end;
$$;

create or replace function private.decline_league_join(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  deleted_count integer;
begin
  current_id := private.require_self();

  delete from public.league_join_requests
  where id = p_request_id
    and recipient_id = current_id;

  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  return true;
end;
$$;

create or replace function private.cancel_league_join(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  deleted_count integer;
begin
  current_id := private.require_self();

  delete from public.league_join_requests
  where id = p_request_id
    and requester_id = current_id;

  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  return true;
end;
$$;

create or replace function public.join_league(p_league_id uuid, p_partner_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.request_league_join(p_league_id, p_partner_id);
$$;

create or replace function public.request_league_join(p_league_id uuid, p_partner_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.request_league_join(p_league_id, p_partner_id);
$$;

create or replace function public.accept_league_join(p_request_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.accept_league_join(p_request_id);
$$;

create or replace function public.decline_league_join(p_request_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.decline_league_join(p_request_id);
$$;

create or replace function public.cancel_league_join(p_request_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_league_join(p_request_id);
$$;

grant execute on function private.request_league_join(uuid, uuid) to authenticated;
grant execute on function private.accept_league_join(uuid) to authenticated;
grant execute on function private.decline_league_join(uuid) to authenticated;
grant execute on function private.cancel_league_join(uuid) to authenticated;
grant execute on function public.request_league_join(uuid, uuid) to authenticated;
grant execute on function public.accept_league_join(uuid) to authenticated;
grant execute on function public.decline_league_join(uuid) to authenticated;
grant execute on function public.cancel_league_join(uuid) to authenticated;

revoke execute on function private.join_league(uuid, uuid) from public, anon, authenticated;
