alter table public.matches
  add column duration_minutes integer not null default 120
  constraint matches_duration_minutes_check check (
    duration_minutes between 30 and 240
    and duration_minutes % 30 = 0
  );

create or replace function private.normalized_match_duration(p_minutes integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_minutes is null then
    return 120;
  end if;
  if p_minutes < 30 or p_minutes > 240 or p_minutes % 30 <> 0 then
    raise exception 'INVALID_DURATION';
  end if;
  return p_minutes;
end;
$$;

drop function if exists public.create_match(text, timestamptz, jsonb, jsonb, jsonb, jsonb);
drop function if exists private.create_match(text, timestamptz, jsonb, jsonb, jsonb, jsonb);
drop function if exists public.create_league_match(uuid, text, timestamptz, jsonb);
drop function if exists private.create_league_match(uuid, text, timestamptz, jsonb);
drop function if exists public.create_matchmaker_court_match(uuid, integer, timestamptz, uuid[]);
drop function if exists private.create_matchmaker_court_match(uuid, integer, timestamptz, uuid[]);

create or replace function private.create_match(
  p_status text,
  p_played_at timestamptz,
  p_partner jsonb,
  p_opponent1 jsonb,
  p_opponent2 jsonb,
  p_sets jsonb,
  p_duration_minutes integer default 120
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  new_id uuid;
  self_json jsonb;
  is_singles boolean;
  duration integer;
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

  duration := private.normalized_match_duration(p_duration_minutes);

  is_singles :=
    (p_partner is null or p_partner = 'null'::jsonb)
    and (p_opponent2 is null or p_opponent2 = 'null'::jsonb);
  if is_singles then
    if p_opponent1 is null or p_opponent1 = 'null'::jsonb then
      raise exception 'PLAYER_REQUIRED';
    end if;
  elsif p_partner is null or p_opponent1 is null or p_opponent2 is null
     or p_partner = 'null'::jsonb or p_opponent1 = 'null'::jsonb or p_opponent2 = 'null'::jsonb then
    raise exception 'PLAYER_REQUIRED';
  end if;

  insert into public.matches (created_by, played_at, status, duration_minutes)
  values (current_id, p_played_at, p_status, duration)
  returning id into new_id;

  self_json := jsonb_build_object('profile_id', current_id);
  perform private.insert_match_player(new_id, 1, 1, self_json);
  if is_singles then
    perform private.insert_match_player(new_id, 2, 1, p_opponent1);
  else
    perform private.insert_match_player(new_id, 1, 2, p_partner);
    perform private.insert_match_player(new_id, 2, 1, p_opponent1);
    perform private.insert_match_player(new_id, 2, 2, p_opponent2);
  end if;

  if p_status = 'played' then
    perform private.insert_match_sets(new_id, p_sets);
  elsif p_sets is not null and p_sets <> 'null'::jsonb and jsonb_typeof(p_sets) = 'array' and jsonb_array_length(p_sets) > 0 then
    raise exception 'FUTURE_MATCH_NO_RESULT';
  end if;

  return new_id;
end;
$$;

create or replace function public.create_match(
  p_status text,
  p_played_at timestamptz,
  p_partner jsonb,
  p_opponent1 jsonb,
  p_opponent2 jsonb,
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
  v_result := private.create_match(
    p_status, p_played_at, p_partner, p_opponent1, p_opponent2, p_sets, p_duration_minutes
  );
  if p_status = 'played' then
    perform private.refresh_ratings_for_match(v_result);
  end if;
  return v_result;
end;
$$;

create or replace function private.create_league_match(
  p_fixture_id uuid,
  p_status text,
  p_played_at timestamptz,
  p_sets jsonb,
  p_duration_minutes integer default 120
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
  duration integer;
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

  duration := private.normalized_match_duration(p_duration_minutes);

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

  insert into public.matches (created_by, played_at, status, league_fixture_id, duration_minutes)
  values (current_id, p_played_at, p_status, p_fixture_id, duration)
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
  end if;
  return v_result;
end;
$$;

create or replace function private.create_matchmaker_court_match(
  p_listing_id uuid,
  p_court integer,
  p_played_at timestamptz,
  p_players uuid[],
  p_duration_minutes integer default 120
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
  duration integer;
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

  duration := private.normalized_match_duration(p_duration_minutes);

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

  insert into public.matches (created_by, played_at, status, duration_minutes)
  values (listing.host_id, p_played_at, 'scheduled', duration)
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
  p_players uuid[],
  p_duration_minutes integer default 120
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_matchmaker_court_match(
    p_listing_id, p_court, p_played_at, p_players, p_duration_minutes
  );
$$;

grant execute on function private.create_match(text, timestamptz, jsonb, jsonb, jsonb, jsonb, integer) to authenticated;
grant execute on function public.create_match(text, timestamptz, jsonb, jsonb, jsonb, jsonb, integer) to authenticated;
grant execute on function private.create_league_match(uuid, text, timestamptz, jsonb, integer) to authenticated;
grant execute on function public.create_league_match(uuid, text, timestamptz, jsonb, integer) to authenticated;
grant execute on function private.create_matchmaker_court_match(uuid, integer, timestamptz, uuid[], integer) to authenticated;
grant execute on function public.create_matchmaker_court_match(uuid, integer, timestamptz, uuid[], integer) to authenticated;
