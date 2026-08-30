create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id),
  name text not null default 'Liga',
  starts_on date not null,
  ends_on date not null,
  signup_deadline timestamptz not null,
  constraint leagues_dates check (ends_on >= starts_on)
);

create table public.league_teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id)
);

create table public.league_team_players (
  league_id uuid not null references public.leagues (id) on delete cascade,
  team_id uuid not null references public.league_teams (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  slot smallint not null check (slot in (1, 2)),
  primary key (league_id, profile_id),
  unique (team_id, slot)
);

create table public.league_fixtures (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  team_a_id uuid not null references public.league_teams (id) on delete cascade,
  team_b_id uuid not null references public.league_teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  match_id uuid unique references public.matches (id) on delete set null,
  constraint league_fixtures_two_teams check (team_a_id <> team_b_id),
  constraint league_fixtures_unique_pair unique (league_id, team_a_id, team_b_id)
);

alter table public.matches
  add column if not exists league_fixture_id uuid unique
  references public.league_fixtures (id) on delete set null;

create table public.league_fixture_messages (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.league_fixtures (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index league_teams_league_idx on public.league_teams (league_id);
create index league_fixtures_league_idx on public.league_fixtures (league_id);
create index league_fixture_messages_idx
  on public.league_fixture_messages (fixture_id, created_at);

alter table public.leagues enable row level security;
alter table public.league_teams enable row level security;
alter table public.league_team_players enable row level security;
alter table public.league_fixtures enable row level security;
alter table public.league_fixture_messages enable row level security;

revoke all on public.leagues from anon, authenticated;
revoke all on public.league_teams from anon, authenticated;
revoke all on public.league_team_players from anon, authenticated;
revoke all on public.league_fixtures from anon, authenticated;
revoke all on public.league_fixture_messages from anon, authenticated;

grant select on public.leagues to authenticated;
grant select on public.league_teams to authenticated;
grant select on public.league_team_players to authenticated;
grant select on public.league_fixtures to authenticated;
grant select on public.league_fixture_messages to authenticated;

create or replace function private.is_league_fixture_player(p_fixture_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.league_fixtures f
    join public.league_team_players p on p.team_id in (f.team_a_id, f.team_b_id)
    where f.id = p_fixture_id
      and p.profile_id = auth.uid()
  );
$$;

drop policy if exists leagues_select_members on public.leagues;
create policy leagues_select_members
  on public.leagues for select to authenticated
  using (private.is_active_member());

drop policy if exists league_teams_select_members on public.league_teams;
create policy league_teams_select_members
  on public.league_teams for select to authenticated
  using (private.is_active_member());

drop policy if exists league_team_players_select_members on public.league_team_players;
create policy league_team_players_select_members
  on public.league_team_players for select to authenticated
  using (private.is_active_member());

drop policy if exists league_fixtures_select_members on public.league_fixtures;
create policy league_fixtures_select_members
  on public.league_fixtures for select to authenticated
  using (private.is_active_member());

drop policy if exists league_fixture_messages_select_players
  on public.league_fixture_messages;
create policy league_fixture_messages_select_players
  on public.league_fixture_messages for select to authenticated
  using (
    private.is_active_member()
    and private.is_league_fixture_player(fixture_id)
  );

create or replace function private.create_league(
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_signup_deadline timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  cleaned text;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  cleaned := left(trim(coalesce(p_name, '')), 80);
  if cleaned = '' then
    cleaned := 'Liga';
  end if;

  if p_starts_on is null or p_ends_on is null or p_signup_deadline is null then
    raise exception 'LEAGUE_DATES_REQUIRED';
  end if;

  if p_ends_on < p_starts_on then
    raise exception 'LEAGUE_DATES_INVALID';
  end if;

  insert into public.leagues (
    created_by, name, starts_on, ends_on, signup_deadline
  )
  values (auth.uid(), cleaned, p_starts_on, p_ends_on, p_signup_deadline)
  returning id into new_id;

  return new_id;
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

  return new_team;
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

  return new_id;
end;
$$;

create or replace function private.create_league_match(
  p_fixture_id uuid,
  p_status text,
  p_played_at timestamptz,
  p_sets jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  new_id uuid;
  fixture public.league_fixtures%rowtype;
  my_team uuid;
  opp_team uuid;
  mate uuid;
  opp1 uuid;
  opp2 uuid;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_status not in ('scheduled', 'played') then
    raise exception 'INVALID_STATUS';
  end if;

  if p_played_at is null then
    raise exception 'INVALID_WHEN';
  end if;

  if p_status = 'played' and p_played_at > now() + interval '15 minutes' then
    raise exception 'INVALID_WHEN';
  end if;

  if p_status = 'scheduled' and p_played_at < now() - interval '15 minutes' then
    raise exception 'INVALID_WHEN';
  end if;

  select * into fixture
  from public.league_fixtures
  where id = p_fixture_id;

  if fixture.id is null then
    raise exception 'FIXTURE_NOT_FOUND';
  end if;

  if fixture.match_id is not null then
    raise exception 'LEAGUE_MATCH_ALREADY_SET';
  end if;

  select team_id into my_team
  from public.league_team_players
  where profile_id = current_id
    and team_id in (fixture.team_a_id, fixture.team_b_id);

  if my_team is null then
    raise exception 'NOT_FIXTURE_PLAYER';
  end if;

  opp_team := case when my_team = fixture.team_a_id then fixture.team_b_id else fixture.team_a_id end;

  select profile_id into mate
  from public.league_team_players
  where team_id = my_team and profile_id <> current_id;

  select profile_id into opp1
  from public.league_team_players
  where team_id = opp_team and slot = 1;

  select profile_id into opp2
  from public.league_team_players
  where team_id = opp_team and slot = 2;

  insert into public.matches (created_by, played_at, status, league_fixture_id)
  values (current_id, p_played_at, p_status, p_fixture_id)
  returning id into new_id;

  perform private.insert_match_player(
    new_id, 1, 1, jsonb_build_object('profile_id', current_id)
  );
  perform private.insert_match_player(
    new_id, 1, 2, jsonb_build_object('profile_id', mate)
  );
  perform private.insert_match_player(
    new_id, 2, 1, jsonb_build_object('profile_id', opp1)
  );
  perform private.insert_match_player(
    new_id, 2, 2, jsonb_build_object('profile_id', opp2)
  );

  if p_status = 'played' then
    perform private.insert_match_sets(new_id, p_sets);
  elsif p_sets is not null and p_sets <> 'null'::jsonb
        and jsonb_typeof(p_sets) = 'array' and jsonb_array_length(p_sets) > 0 then
    raise exception 'FUTURE_MATCH_NO_RESULT';
  end if;

  update public.league_fixtures
  set match_id = new_id
  where id = p_fixture_id;

  return new_id;
end;
$$;

create or replace function public.create_league(
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_signup_deadline timestamptz
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_league(p_name, p_starts_on, p_ends_on, p_signup_deadline);
$$;

create or replace function public.join_league(p_league_id uuid, p_partner_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.join_league(p_league_id, p_partner_id);
$$;

create or replace function public.add_league_message(p_fixture_id uuid, p_body text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.add_league_message(p_fixture_id, p_body);
$$;

create or replace function public.create_league_match(
  p_fixture_id uuid,
  p_status text,
  p_played_at timestamptz,
  p_sets jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_league_match(p_fixture_id, p_status, p_played_at, p_sets);
$$;

grant execute on function private.is_league_fixture_player(uuid) to authenticated;
grant execute on function private.create_league(text, date, date, timestamptz) to authenticated;
grant execute on function private.join_league(uuid, uuid) to authenticated;
grant execute on function private.add_league_message(uuid, text) to authenticated;
grant execute on function private.create_league_match(uuid, text, timestamptz, jsonb) to authenticated;

grant execute on function public.create_league(text, date, date, timestamptz) to authenticated;
grant execute on function public.join_league(uuid, uuid) to authenticated;
grant execute on function public.add_league_message(uuid, text) to authenticated;
grant execute on function public.create_league_match(uuid, text, timestamptz, jsonb) to authenticated;
