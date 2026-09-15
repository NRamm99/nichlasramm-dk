alter table public.leagues
  add column if not exists group_count smallint not null default 2,
  add column if not exists finals_on date,
  add column if not exists finals_starts_at timestamptz,
  add column if not exists finals_venue text,
  add column if not exists finals_note text;

alter table public.leagues
  drop constraint if exists leagues_group_count;
alter table public.leagues
  add constraint leagues_group_count check (group_count between 2 and 4);

alter table public.leagues
  drop constraint if exists leagues_finals_venue_len;
alter table public.leagues
  add constraint leagues_finals_venue_len
  check (finals_venue is null or char_length(finals_venue) <= 80);

alter table public.leagues
  drop constraint if exists leagues_finals_note_len;
alter table public.leagues
  add constraint leagues_finals_note_len
  check (finals_note is null or char_length(finals_note) <= 280);

create table if not exists public.league_groups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  label text not null,
  sort_order smallint not null,
  constraint league_groups_label unique (league_id, label),
  constraint league_groups_sort unique (league_id, sort_order),
  constraint league_groups_order check (sort_order between 1 and 4),
  constraint league_groups_label_az check (label in ('A', 'B', 'C', 'D'))
);

create index if not exists league_groups_league_idx
  on public.league_groups (league_id, sort_order);

alter table public.league_teams
  add column if not exists group_id uuid references public.league_groups (id) on delete set null;

create index if not exists league_teams_group_idx
  on public.league_teams (group_id);

alter table public.league_fixtures
  add column if not exists stage text not null default 'group',
  add column if not exists knockout_round text,
  add column if not exists bracket_slot smallint;

alter table public.league_fixtures
  drop constraint if exists league_fixtures_stage_values;
alter table public.league_fixtures
  add constraint league_fixtures_stage_values
  check (stage in ('group', 'knockout'));

alter table public.league_fixtures
  drop constraint if exists league_fixtures_stage_round;
alter table public.league_fixtures
  add constraint league_fixtures_stage_round check (
    (stage = 'group' and knockout_round is null and bracket_slot is null)
    or (
      stage = 'knockout'
      and knockout_round = 'semi'
      and bracket_slot in (1, 2)
    )
    or (
      stage = 'knockout'
      and knockout_round = 'final'
      and bracket_slot is null
    )
  );

alter table public.league_fixtures
  drop constraint if exists league_fixtures_unique_pair;
alter table public.league_fixtures
  add constraint league_fixtures_unique_pair
  unique (league_id, team_a_id, team_b_id, stage);

drop index if exists league_fixtures_semi_slot;
create unique index league_fixtures_semi_slot
  on public.league_fixtures (league_id, bracket_slot)
  where stage = 'knockout' and knockout_round = 'semi';

drop index if exists league_fixtures_one_final;
create unique index league_fixtures_one_final
  on public.league_fixtures (league_id)
  where stage = 'knockout' and knockout_round = 'final';

create index if not exists league_fixtures_stage_idx
  on public.league_fixtures (league_id, stage);

alter table public.league_groups enable row level security;

revoke all on public.league_groups from anon, authenticated;
grant select on public.league_groups to authenticated;

drop policy if exists league_groups_select_members on public.league_groups;
create policy league_groups_select_members
  on public.league_groups for select to authenticated
  using (private.is_active_member());

create or replace function private.ensure_league_groups(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count smallint;
  v_labels text[] := array['A', 'B', 'C', 'D'];
  i integer;
begin
  select group_count into v_count
  from public.leagues
  where id = p_league_id;

  if v_count is null then
    raise exception 'LEAGUE_NOT_FOUND';
  end if;

  for i in 1..v_count loop
    insert into public.league_groups (league_id, label, sort_order)
    values (p_league_id, v_labels[i], i)
    on conflict (league_id, sort_order) do nothing;
  end loop;

  update public.league_teams
  set group_id = null
  where league_id = p_league_id
    and group_id in (
      select id from public.league_groups
      where league_id = p_league_id and sort_order > v_count
    );

  delete from public.league_groups
  where league_id = p_league_id
    and sort_order > v_count;
end;
$$;

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

  if exists (
    select 1 from public.leagues
    where ends_on >= current_date
  ) then
    raise exception 'SEASON_STILL_RUNNING';
  end if;

  insert into public.leagues (
    created_by, name, starts_on, ends_on, signup_deadline
  )
  values (auth.uid(), cleaned, p_starts_on, p_ends_on, p_signup_deadline)
  returning id into new_id;

  perform private.ensure_league_groups(new_id);

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
begin
  current_id := private.assert_league_signup_ok(p_league_id, p_partner_id);

  insert into public.league_teams (league_id, created_by)
  values (p_league_id, current_id)
  returning id into new_team;

  insert into public.league_team_players (league_id, team_id, profile_id, slot)
  values
    (p_league_id, new_team, current_id, 1),
    (p_league_id, new_team, p_partner_id, 2);

  perform private.clear_league_join_requests(p_league_id, current_id, p_partner_id);

  return new_team;
end;
$$;

create or replace function private.drop_league_fixture(p_fixture_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match uuid;
  v_status text;
begin
  select f.match_id, m.status
  into v_match, v_status
  from public.league_fixtures f
  left join public.matches m on m.id = f.match_id
  where f.id = p_fixture_id;

  if not found then
    return;
  end if;

  delete from public.league_fixtures where id = p_fixture_id;

  if v_match is not null and v_status = 'scheduled' then
    delete from public.matches where id = v_match;
  end if;
end;
$$;

create or replace function private.league_knockout_played(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.league_fixtures f
    join public.matches m on m.id = f.match_id
    where f.league_id = p_league_id
      and f.stage = 'knockout'
      and m.status = 'played'
      and exists (select 1 from public.match_sets s where s.match_id = m.id)
  );
$$;

create or replace function private.drop_unplayed_knockout(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if private.league_knockout_played(p_league_id) then
    raise exception 'KNOCKOUT_ALREADY_PLAYED';
  end if;

  for v_id in
    select id
    from public.league_fixtures
    where league_id = p_league_id
      and stage = 'knockout'
  loop
    perform private.drop_league_fixture(v_id);
  end loop;
end;
$$;

create or replace function private.sync_league_group_fixtures(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fixture public.league_fixtures%rowtype;
  v_a uuid;
  v_b uuid;
begin
  perform private.drop_unplayed_knockout(p_league_id);

  for v_fixture in
    select *
    from public.league_fixtures
    where league_id = p_league_id
      and stage = 'group'
  loop
    select t.group_id into v_a
    from public.league_teams t
    where t.id = v_fixture.team_a_id;

    select t.group_id into v_b
    from public.league_teams t
    where t.id = v_fixture.team_b_id;

    if v_a is null or v_b is null or v_a <> v_b then
      perform private.drop_league_fixture(v_fixture.id);
    end if;
  end loop;

  insert into public.league_fixtures (league_id, team_a_id, team_b_id, stage)
  select
    p_league_id,
    least(a.id, b.id),
    greatest(a.id, b.id),
    'group'
  from public.league_teams a
  join public.league_teams b
    on b.league_id = a.league_id
   and b.id > a.id
   and b.group_id = a.group_id
  where a.league_id = p_league_id
    and a.group_id is not null
  on conflict (league_id, team_a_id, team_b_id, stage) do nothing;
end;
$$;

create or replace function private.set_league_group_count(
  p_league_id uuid,
  p_group_count integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if p_group_count is null or p_group_count < 2 or p_group_count > 4 then
    raise exception 'INVALID_GROUP_COUNT';
  end if;

  if not exists (select 1 from public.leagues where id = p_league_id) then
    raise exception 'LEAGUE_NOT_FOUND';
  end if;

  perform private.drop_unplayed_knockout(p_league_id);

  update public.leagues
  set group_count = p_group_count
  where id = p_league_id;

  perform private.ensure_league_groups(p_league_id);
  perform private.sync_league_group_fixtures(p_league_id);

  return true;
end;
$$;

create or replace function private.set_league_team_groups(
  p_league_id uuid,
  p_assignments jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_group_league uuid;
  v_team_league uuid;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if not exists (select 1 from public.leagues where id = p_league_id) then
    raise exception 'LEAGUE_NOT_FOUND';
  end if;

  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'INVALID_GROUP_ASSIGNMENT';
  end if;

  perform private.ensure_league_groups(p_league_id);
  perform private.drop_unplayed_knockout(p_league_id);

  for v_row in
    select *
    from jsonb_to_recordset(p_assignments) as x(team_id uuid, group_id uuid)
  loop
    if v_row.team_id is null then
      raise exception 'INVALID_GROUP_ASSIGNMENT';
    end if;

    select league_id into v_team_league
    from public.league_teams
    where id = v_row.team_id;

    if v_team_league is null or v_team_league <> p_league_id then
      raise exception 'LEAGUE_TEAM_NOT_FOUND';
    end if;

    if v_row.group_id is not null then
      select league_id into v_group_league
      from public.league_groups
      where id = v_row.group_id;

      if v_group_league is null or v_group_league <> p_league_id then
        raise exception 'GROUP_NOT_IN_LEAGUE';
      end if;
    end if;

    update public.league_teams
    set group_id = v_row.group_id
    where id = v_row.team_id;
  end loop;

  perform private.sync_league_group_fixtures(p_league_id);

  return true;
end;
$$;

create or replace function private.seed_league_groups(p_league_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_groups uuid[];
  v_team uuid;
  v_i integer := 0;
  v_cycle integer;
  v_index integer;
  v_n integer;
  v_start integer;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if not exists (select 1 from public.leagues where id = p_league_id) then
    raise exception 'LEAGUE_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.league_fixtures f
    join public.matches m on m.id = f.match_id
    where f.league_id = p_league_id
      and f.stage = 'group'
      and m.status = 'played'
      and exists (select 1 from public.match_sets s where s.match_id = m.id)
  ) then
    raise exception 'GROUP_MATCHES_PLAYED';
  end if;

  perform private.ensure_league_groups(p_league_id);

  select group_count into v_n
  from public.leagues
  where id = p_league_id;

  select coalesce(
    (select start_rating from public.rating_settings where id = true),
    1000
  )
  into v_start;

  select array_agg(id order by sort_order)
  into v_groups
  from public.league_groups
  where league_id = p_league_id;

  update public.league_teams
  set group_id = null
  where league_id = p_league_id;

  for v_team in
    select t.id
    from public.league_teams t
    left join public.league_team_players p on p.team_id = t.id
    left join public.player_ratings r on r.profile_id = p.profile_id
    where t.league_id = p_league_id
    group by t.id
    order by avg(coalesce(r.rating, v_start)) desc, t.id
  loop
    v_cycle := v_i % (2 * v_n);
    if v_cycle < v_n then
      v_index := v_cycle;
    else
      v_index := 2 * v_n - 1 - v_cycle;
    end if;

    update public.league_teams
    set group_id = v_groups[v_index + 1]
    where id = v_team;

    v_i := v_i + 1;
  end loop;

  select count(*) into v_count
  from public.league_teams
  where league_id = p_league_id;

  if v_count = 0 then
    raise exception 'LEAGUE_TEAM_NOT_FOUND';
  end if;

  perform private.sync_league_group_fixtures(p_league_id);

  return true;
end;
$$;

create or replace function private.update_league_finals(
  p_league_id uuid,
  p_finals_on date,
  p_finals_starts_at timestamptz,
  p_finals_venue text,
  p_finals_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venue text;
  v_note text;
  updated_count integer;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  v_venue := nullif(left(trim(coalesce(p_finals_venue, '')), 80), '');
  v_note := nullif(left(trim(coalesce(p_finals_note, '')), 280), '');

  update public.leagues
  set
    finals_on = p_finals_on,
    finals_starts_at = coalesce(
      p_finals_starts_at,
      case
        when p_finals_on is null then null
        else (p_finals_on::timestamp + interval '10 hours')
          at time zone 'Europe/Copenhagen'
      end
    ),
    finals_venue = v_venue,
    finals_note = v_note
  where id = p_league_id;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'LEAGUE_NOT_FOUND';
  end if;

  return true;
end;
$$;

create or replace function private.league_match_winner_side(p_match_id uuid)
returns smallint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_t1 integer := 0;
  v_t2 integer := 0;
  v_row record;
  v_unfin1 integer;
  v_unfin2 integer;
begin
  if not exists (
    select 1 from public.matches where id = p_match_id and status = 'played'
  ) then
    return null;
  end if;

  if exists (
    select 1 from public.match_result_corrections where match_id = p_match_id
  ) then
    return null;
  end if;

  if not exists (
    select 1 from public.match_sets where match_id = p_match_id
  ) then
    return null;
  end if;

  for v_row in
    select team1_games, team2_games
    from public.match_sets
    where match_id = p_match_id
    order by set_number
  loop
    if v_row.team1_games <> v_row.team2_games
       and greatest(v_row.team1_games, v_row.team2_games) >= 6 then
      if v_row.team1_games > v_row.team2_games then
        v_t1 := v_t1 + 1;
      else
        v_t2 := v_t2 + 1;
      end if;
    else
      v_unfin1 := v_row.team1_games;
      v_unfin2 := v_row.team2_games;
    end if;
  end loop;

  if v_t1 = v_t2
     and v_unfin1 is not null
     and v_unfin1 <> v_unfin2 then
    if v_unfin1 > v_unfin2 then
      v_t1 := v_t1 + 1;
    else
      v_t2 := v_t2 + 1;
    end if;
  end if;

  if v_t1 = v_t2 then
    return null;
  elsif v_t1 > v_t2 then
    return 1;
  else
    return 2;
  end if;
end;
$$;

create or replace function private.league_fixture_result(p_fixture_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_match uuid;
  v_team_a uuid;
  v_team_b uuid;
  v_side smallint;
  v_team1_is_a boolean;
begin
  select match_id, team_a_id, team_b_id
  into v_match, v_team_a, v_team_b
  from public.league_fixtures
  where id = p_fixture_id;

  if v_match is null then
    return 'none';
  end if;

  v_side := private.league_match_winner_side(v_match);
  if not exists (
    select 1 from public.matches where id = v_match and status = 'played'
  ) then
    return 'none';
  end if;
  if not exists (
    select 1 from public.match_sets where match_id = v_match
  ) then
    return 'none';
  end if;
  if exists (
    select 1 from public.match_result_corrections where match_id = v_match
  ) then
    return 'none';
  end if;

  select coalesce(bool_and(
    p.profile_id in (
      select lp.profile_id
      from public.league_team_players lp
      where lp.team_id = v_team_a
    )
  ), false)
  into v_team1_is_a
  from public.match_players p
  where p.match_id = v_match
    and p.team = 1
    and p.profile_id is not null;

  if v_side is null then
    return 'draw';
  end if;

  if v_team1_is_a then
    if v_side = 1 then
      return 'a';
    end if;
    return 'b';
  end if;

  if v_side = 1 then
    return 'b';
  end if;
  return 'a';
end;
$$;

create or replace function private.league_fixture_winner_team(p_fixture_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result text;
  v_a uuid;
  v_b uuid;
begin
  select team_a_id, team_b_id into v_a, v_b
  from public.league_fixtures
  where id = p_fixture_id;

  v_result := private.league_fixture_result(p_fixture_id);
  if v_result = 'a' then
    return v_a;
  end if;
  if v_result = 'b' then
    return v_b;
  end if;
  return null;
end;
$$;

create or replace function private.league_team_table(p_league_id uuid)
returns table (
  group_id uuid,
  group_label text,
  team_id uuid,
  points integer,
  wins integer,
  sort_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with results as (
    select
      f.team_a_id,
      f.team_b_id,
      private.league_fixture_result(f.id) as res
    from public.league_fixtures f
    where f.league_id = p_league_id
      and f.stage = 'group'
  ),
  scored as (
    select
      x.team_id,
      sum(x.pts)::integer as points,
      sum(x.win)::integer as wins
    from (
      select
        r.team_a_id as team_id,
        case r.res when 'draw' then 1 when 'a' then 3 else 0 end as pts,
        case r.res when 'a' then 1 else 0 end as win
      from results r
      union all
      select
        r.team_b_id,
        case r.res when 'draw' then 1 when 'b' then 3 else 0 end,
        case r.res when 'b' then 1 else 0 end
      from results r
    ) x
    group by x.team_id
  )
  select
    t.group_id,
    g.label,
    t.id,
    coalesce(s.points, 0),
    coalesce(s.wins, 0),
    coalesce((
      select string_agg(pr.last_name || pr.first_name, ' ' order by lp.slot)
      from public.league_team_players lp
      join public.profiles pr on pr.id = lp.profile_id
      where lp.team_id = t.id
    ), t.id::text)
  from public.league_teams t
  join public.league_groups g on g.id = t.group_id
  left join scored s on s.team_id = t.id
  where t.league_id = p_league_id
    and t.group_id is not null;
$$;

create or replace function private.schedule_knockout_match(
  p_fixture_id uuid,
  p_home uuid,
  p_away uuid,
  p_played_at timestamptz,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
  v_h1 uuid;
  v_h2 uuid;
  v_a1 uuid;
  v_a2 uuid;
begin
  select profile_id into v_h1
  from public.league_team_players
  where team_id = p_home and slot = 1;
  select profile_id into v_h2
  from public.league_team_players
  where team_id = p_home and slot = 2;
  select profile_id into v_a1
  from public.league_team_players
  where team_id = p_away and slot = 1;
  select profile_id into v_a2
  from public.league_team_players
  where team_id = p_away and slot = 2;

  if v_h1 is null or v_h2 is null or v_a1 is null or v_a2 is null then
    raise exception 'LEAGUE_TEAM_NOT_FOUND';
  end if;

  insert into public.matches (
    created_by, played_at, status, league_fixture_id, duration_minutes
  )
  values (p_created_by, p_played_at, 'scheduled', p_fixture_id, 90)
  returning id into new_id;

  perform private.insert_match_player(
    new_id, 1, 1, jsonb_build_object('profile_id', v_h1)
  );
  perform private.insert_match_player(
    new_id, 1, 2, jsonb_build_object('profile_id', v_h2)
  );
  perform private.insert_match_player(
    new_id, 2, 1, jsonb_build_object('profile_id', v_a1)
  );
  perform private.insert_match_player(
    new_id, 2, 2, jsonb_build_object('profile_id', v_a2)
  );

  update public.league_fixtures
  set match_id = new_id
  where id = p_fixture_id;

  return new_id;
end;
$$;

create or replace function private.insert_knockout_fixture(
  p_league_id uuid,
  p_home uuid,
  p_away uuid,
  p_round text,
  p_slot smallint,
  p_played_at timestamptz,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.league_fixtures (
    league_id, team_a_id, team_b_id, stage, knockout_round, bracket_slot
  )
  values (
    p_league_id,
    least(p_home, p_away),
    greatest(p_home, p_away),
    'knockout',
    p_round,
    p_slot
  )
  returning id into v_id;

  perform private.schedule_knockout_match(
    v_id, p_home, p_away, p_played_at, p_created_by
  );

  return v_id;
end;
$$;

create or replace function private.generate_league_knockout(p_league_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league public.leagues%rowtype;
  v_start timestamptz;
  v_created uuid;
  v_group record;
  v_team record;
  v_result text;
  v_points integer;
  v_wins integer;
  v_place integer;
  v_name text;
  v_winners uuid[] := '{}';
  v_seconds uuid[] := '{}';
  v_second_points integer[] := '{}';
  v_second_wins integer[] := '{}';
  v_second_names text[] := '{}';
  v_best_second uuid;
  v_best_points integer := -1;
  v_best_wins integer := -1;
  v_best_name text := '';
  v_qual uuid[] := '{}';
  v_seed_ids uuid[] := '{}';
  v_seed_points integer[] := '{}';
  v_seed_wins integer[] := '{}';
  v_seed_names text[] := '{}';
  v_i integer;
  v_j integer;
  v_tmp_id uuid;
  v_tmp_p integer;
  v_tmp_w integer;
  v_tmp_n text;
  v_a1 uuid;
  v_a2 uuid;
  v_b1 uuid;
  v_b2 uuid;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select * into v_league from public.leagues where id = p_league_id;
  if v_league.id is null then
    raise exception 'LEAGUE_NOT_FOUND';
  end if;

  if v_league.finals_on is null then
    raise exception 'FINALS_REQUIRED';
  end if;

  perform private.drop_unplayed_knockout(p_league_id);

  v_start := coalesce(
    v_league.finals_starts_at,
    (v_league.finals_on::timestamp + interval '10 hours')
      at time zone 'Europe/Copenhagen'
  );
  v_created := coalesce(auth.uid(), v_league.created_by);

  for v_group in
    select id, label, sort_order
    from public.league_groups
    where league_id = p_league_id
    order by sort_order
  loop
    v_place := 0;
    for v_team in
      select t.team_id, t.points, t.wins, t.sort_name
      from private.league_team_table(p_league_id) t
      where t.group_id = v_group.id
      order by t.points desc, t.wins desc, t.sort_name
    loop
      v_place := v_place + 1;
      if v_place = 1 then
        v_winners := array_append(v_winners, v_team.team_id);
      elsif v_place = 2 then
        v_seconds := array_append(v_seconds, v_team.team_id);
        v_second_points := array_append(v_second_points, v_team.points);
        v_second_wins := array_append(v_second_wins, v_team.wins);
        v_second_names := array_append(v_second_names, v_team.sort_name);
      end if;
    end loop;
  end loop;

  if v_league.group_count = 2 then
    select t.team_id into v_a1
    from private.league_team_table(p_league_id) t
    where t.group_label = 'A'
    order by t.points desc, t.wins desc, t.sort_name
    limit 1 offset 0;
    select t.team_id into v_a2
    from private.league_team_table(p_league_id) t
    where t.group_label = 'A'
    order by t.points desc, t.wins desc, t.sort_name
    limit 1 offset 1;
    select t.team_id into v_b1
    from private.league_team_table(p_league_id) t
    where t.group_label = 'B'
    order by t.points desc, t.wins desc, t.sort_name
    limit 1 offset 0;
    select t.team_id into v_b2
    from private.league_team_table(p_league_id) t
    where t.group_label = 'B'
    order by t.points desc, t.wins desc, t.sort_name
    limit 1 offset 1;

    if v_a1 is null or v_a2 is null or v_b1 is null or v_b2 is null then
      raise exception 'NOT_ENOUGH_QUALIFIERS';
    end if;

    perform private.insert_knockout_fixture(
      p_league_id, v_a1, v_b2, 'semi', 1, v_start, v_created
    );
    perform private.insert_knockout_fixture(
      p_league_id, v_b1, v_a2, 'semi', 2, v_start + interval '90 minutes', v_created
    );
    return true;
  end if;

  if v_league.group_count = 3 then
    v_i := 1;
    while v_i <= coalesce(array_length(v_seconds, 1), 0) loop
      if v_second_points[v_i] > v_best_points
         or (
           v_second_points[v_i] = v_best_points
           and v_second_wins[v_i] > v_best_wins
         )
         or (
           v_second_points[v_i] = v_best_points
           and v_second_wins[v_i] = v_best_wins
           and v_second_names[v_i] < v_best_name
         )
         or v_best_second is null then
        v_best_second := v_seconds[v_i];
        v_best_points := v_second_points[v_i];
        v_best_wins := v_second_wins[v_i];
        v_best_name := v_second_names[v_i];
      end if;
      v_i := v_i + 1;
    end loop;

    if coalesce(array_length(v_winners, 1), 0) <> 3 or v_best_second is null then
      raise exception 'NOT_ENOUGH_QUALIFIERS';
    end if;

    v_qual := v_winners || v_best_second;
  else
    if coalesce(array_length(v_winners, 1), 0) <> 4 then
      raise exception 'NOT_ENOUGH_QUALIFIERS';
    end if;
    v_qual := v_winners;
  end if;

  foreach v_tmp_id in array v_qual loop
    select points, wins, sort_name
    into v_tmp_p, v_tmp_w, v_tmp_n
    from private.league_team_table(p_league_id)
    where team_id = v_tmp_id;
    v_seed_ids := array_append(v_seed_ids, v_tmp_id);
    v_seed_points := array_append(v_seed_points, v_tmp_p);
    v_seed_wins := array_append(v_seed_wins, v_tmp_w);
    v_seed_names := array_append(v_seed_names, v_tmp_n);
  end loop;

  for v_i in 1..4 loop
    for v_j in v_i+1..4 loop
      if v_seed_points[v_j] > v_seed_points[v_i]
         or (v_seed_points[v_j] = v_seed_points[v_i] and v_seed_wins[v_j] > v_seed_wins[v_i])
         or (
           v_seed_points[v_j] = v_seed_points[v_i]
           and v_seed_wins[v_j] = v_seed_wins[v_i]
           and v_seed_names[v_j] < v_seed_names[v_i]
         ) then
        v_tmp_id := v_seed_ids[v_i];
        v_seed_ids[v_i] := v_seed_ids[v_j];
        v_seed_ids[v_j] := v_tmp_id;
        v_tmp_p := v_seed_points[v_i];
        v_seed_points[v_i] := v_seed_points[v_j];
        v_seed_points[v_j] := v_tmp_p;
        v_tmp_w := v_seed_wins[v_i];
        v_seed_wins[v_i] := v_seed_wins[v_j];
        v_seed_wins[v_j] := v_tmp_w;
        v_tmp_n := v_seed_names[v_i];
        v_seed_names[v_i] := v_seed_names[v_j];
        v_seed_names[v_j] := v_tmp_n;
      end if;
    end loop;
  end loop;

  perform private.insert_knockout_fixture(
    p_league_id, v_seed_ids[1], v_seed_ids[4], 'semi', 1, v_start, v_created
  );
  perform private.insert_knockout_fixture(
    p_league_id,
    v_seed_ids[2],
    v_seed_ids[3],
    'semi',
    2,
    v_start + interval '90 minutes',
    v_created
  );

  return true;
end;
$$;

create or replace function private.maybe_create_league_final(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fixture public.league_fixtures%rowtype;
  v_other public.league_fixtures%rowtype;
  v_league public.leagues%rowtype;
  v_w1 uuid;
  v_w2 uuid;
  v_start timestamptz;
begin
  select * into v_fixture
  from public.league_fixtures
  where match_id = p_match_id
    and stage = 'knockout'
    and knockout_round = 'semi';

  if v_fixture.id is null then
    return;
  end if;

  if exists (
    select 1
    from public.league_fixtures
    where league_id = v_fixture.league_id
      and stage = 'knockout'
      and knockout_round = 'final'
  ) then
    return;
  end if;

  select * into v_other
  from public.league_fixtures
  where league_id = v_fixture.league_id
    and stage = 'knockout'
    and knockout_round = 'semi'
    and id <> v_fixture.id;

  if v_other.id is null then
    return;
  end if;

  v_w1 := private.league_fixture_winner_team(v_fixture.id);
  v_w2 := private.league_fixture_winner_team(v_other.id);
  if v_w1 is null or v_w2 is null then
    return;
  end if;

  select * into v_league from public.leagues where id = v_fixture.league_id;
  v_start := coalesce(
    v_league.finals_starts_at + interval '3 hours',
    now() + interval '90 minutes'
  );
  if v_start < now() then
    v_start := now() + interval '90 minutes';
  end if;

  perform private.insert_knockout_fixture(
    v_fixture.league_id,
    v_w1,
    v_w2,
    'final',
    null,
    v_start,
    coalesce(auth.uid(), v_league.created_by)
  );
end;
$$;

create or replace function public.set_league_group_count(
  p_league_id uuid,
  p_group_count integer
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.set_league_group_count(p_league_id, p_group_count);
$$;

create or replace function public.set_league_team_groups(
  p_league_id uuid,
  p_assignments jsonb
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.set_league_team_groups(p_league_id, p_assignments);
$$;

create or replace function public.seed_league_groups(p_league_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.seed_league_groups(p_league_id);
$$;

create or replace function public.update_league_finals(
  p_league_id uuid,
  p_finals_on date,
  p_finals_starts_at timestamptz,
  p_finals_venue text,
  p_finals_note text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.update_league_finals(
    p_league_id,
    p_finals_on,
    p_finals_starts_at,
    p_finals_venue,
    p_finals_note
  );
$$;

create or replace function public.generate_league_knockout(p_league_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.generate_league_knockout(p_league_id);
$$;

create or replace function public.record_match_result(p_match_id uuid, p_sets jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result boolean;
begin
  v_result := private.record_match_result(p_match_id, p_sets);
  perform private.refresh_ratings_for_match(p_match_id);
  perform private.maybe_create_league_final(p_match_id);
  return v_result;
end;
$$;

create or replace function public.accept_match_result_correction(p_match_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result boolean;
begin
  v_result := private.accept_match_result_correction(p_match_id);
  perform private.refresh_ratings_for_match(p_match_id);
  perform private.maybe_create_league_final(p_match_id);
  return v_result;
end;
$$;

create or replace function public.replace_match_result(
  p_match_id uuid,
  p_sets jsonb,
  p_players jsonb default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result boolean;
begin
  v_result := private.replace_match_result(p_match_id, p_sets, p_players);
  perform private.refresh_ratings_for_match(p_match_id);
  perform private.maybe_create_league_final(p_match_id);
  return v_result;
end;
$$;

create or replace function public.create_league_match(
  p_fixture_id uuid,
  p_status text,
  p_played_at timestamptz,
  p_sets jsonb,
  p_duration_minutes integer default 120
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result uuid;
begin
  v_result := private.create_league_match(
    p_fixture_id, p_status, p_played_at, p_sets, p_duration_minutes
  );
  if p_status = 'played' then
    perform private.refresh_ratings_for_match(v_result);
    perform private.maybe_create_league_final(v_result);
  end if;
  return v_result;
end;
$$;

grant execute on function private.ensure_league_groups(uuid) to authenticated;
grant execute on function private.set_league_group_count(uuid, integer) to authenticated;
grant execute on function private.set_league_team_groups(uuid, jsonb) to authenticated;
grant execute on function private.seed_league_groups(uuid) to authenticated;
grant execute on function private.update_league_finals(uuid, date, timestamptz, text, text) to authenticated;
grant execute on function private.generate_league_knockout(uuid) to authenticated;
grant execute on function public.set_league_group_count(uuid, integer) to authenticated;
grant execute on function public.set_league_team_groups(uuid, jsonb) to authenticated;
grant execute on function public.seed_league_groups(uuid) to authenticated;
grant execute on function public.update_league_finals(uuid, date, timestamptz, text, text) to authenticated;
grant execute on function public.generate_league_knockout(uuid) to authenticated;
grant execute on function private.maybe_create_league_final(uuid) to authenticated;

insert into public.league_groups (league_id, label, sort_order)
select l.id, v.label, v.sort_order
from public.leagues l
cross join (
  values ('A', 1), ('B', 2)
) as v(label, sort_order)
where l.group_count >= v.sort_order
on conflict (league_id, sort_order) do nothing;
