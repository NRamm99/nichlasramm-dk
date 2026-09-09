-- Apply one rated match onto in-memory player state and insert rating_events.
-- Returns the updated state unchanged when the match cannot be rated.
create or replace function private.apply_rating_match(
  p_match_id uuid,
  p_played_at timestamptz,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.rating_settings%rowtype;
  v_state jsonb := coalesce(p_state, '{}'::jsonb);
  v_entry jsonb;
  v_set record;
  v_seq integer;
  v_ids uuid[];
  v_teams integer[];
  v_ratings numeric[];
  v_count integer;
  v_i integer;
  v_j integer;
  v_team1_a numeric;
  v_team1_b numeric;
  v_team2_a numeric;
  v_team2_b numeric;
  v_strength1 numeric;
  v_strength2 numeric;
  v_expected1 numeric;
  v_sets1 integer;
  v_sets2 integer;
  v_games1 integer;
  v_games2 integer;
  v_open1 integer;
  v_open2 integer;
  v_score1 numeric;
  v_guests integer;
  v_damping numeric;
  v_mov numeric;
  v_before integer;
  v_played integer;
  v_peak integer;
  v_k numeric;
  v_team_score numeric;
  v_team_expected numeric;
  v_partner numeric;
  v_split numeric;
  v_split_sign integer;
  v_factor numeric;
  v_delta integer;
  v_after integer;
begin
  select * into cfg from public.rating_settings where id;
  if cfg is null then
    return v_state;
  end if;

  select
    array_agg(mp.profile_id order by mp.team, mp.slot),
    array_agg(mp.team order by mp.team, mp.slot)
  into v_ids, v_teams
  from public.match_players mp
  where mp.match_id = p_match_id;

  v_count := coalesce(array_length(v_teams, 1), 0);
  if v_count not in (2, 4) then
    return v_state;
  end if;
  if v_count = 2 and not cfg.include_singles then
    return v_state;
  end if;

  v_ratings := array_fill(null::numeric, array[v_count]);
  v_guests := 0;
  for v_i in 1 .. v_count loop
    if v_ids[v_i] is null then
      v_ratings[v_i] := cfg.guest_rating;
      v_guests := v_guests + 1;
    else
      v_entry := v_state -> v_ids[v_i]::text;
      if v_entry is null then
        v_ratings[v_i] := cfg.start_rating;
      else
        v_ratings[v_i] := (v_entry ->> 'r')::numeric;
      end if;
    end if;
  end loop;

  if v_guests = v_count then
    return v_state;
  end if;

  v_team1_a := null;
  v_team1_b := null;
  v_team2_a := null;
  v_team2_b := null;
  for v_i in 1 .. v_count loop
    if v_teams[v_i] = 1 then
      if v_team1_a is null then
        v_team1_a := v_ratings[v_i];
      else
        v_team1_b := v_ratings[v_i];
      end if;
    else
      if v_team2_a is null then
        v_team2_a := v_ratings[v_i];
      else
        v_team2_b := v_ratings[v_i];
      end if;
    end if;
  end loop;

  if v_team1_a is null or v_team2_a is null then
    return v_state;
  end if;

  v_strength1 := private.rating_team_strength(
    v_team1_a, v_team1_b, cfg.weak_link_weight
  );
  v_strength2 := private.rating_team_strength(
    v_team2_a, v_team2_b, cfg.weak_link_weight
  );
  v_expected1 := private.rating_expected(v_strength1, v_strength2);

  v_sets1 := 0;
  v_sets2 := 0;
  v_games1 := 0;
  v_games2 := 0;
  v_open1 := null;
  v_open2 := null;
  for v_set in
    select s.team1_games, s.team2_games
    from public.match_sets s
    where s.match_id = p_match_id
    order by s.set_number
  loop
    v_games1 := v_games1 + v_set.team1_games;
    v_games2 := v_games2 + v_set.team2_games;
    if v_set.team1_games <> v_set.team2_games
       and greatest(v_set.team1_games, v_set.team2_games) >= 6 then
      if v_set.team1_games > v_set.team2_games then
        v_sets1 := v_sets1 + 1;
      else
        v_sets2 := v_sets2 + 1;
      end if;
    else
      v_open1 := v_set.team1_games;
      v_open2 := v_set.team2_games;
    end if;
  end loop;

  if v_sets1 = v_sets2 and v_open1 is not null and v_open1 <> v_open2 then
    if v_open1 > v_open2 then
      v_sets1 := v_sets1 + 1;
    else
      v_sets2 := v_sets2 + 1;
    end if;
  end if;

  v_score1 := case
    when v_sets1 = v_sets2 then 0.5
    when v_sets1 > v_sets2 then 1
    else 0
  end;

  v_damping := power(cfg.guest_damping, v_guests);

  if cfg.mov_enabled and v_sets1 <> v_sets2 then
    v_mov := private.rating_mov(
      abs(v_games1 - v_games2), cfg.mov_min, cfg.mov_max, cfg.mov_span
    );
  else
    v_mov := 1.0;
  end if;

  select coalesce(max(seq), 0) + 1 into v_seq from public.rating_events;

  for v_i in 1 .. v_count loop
    if v_ids[v_i] is null then
      continue;
    end if;

    v_entry := v_state -> v_ids[v_i]::text;
    if v_entry is null then
      v_before := cfg.start_rating;
      v_played := 0;
      v_peak := cfg.start_rating;
    else
      v_before := (v_entry ->> 'r')::integer;
      v_played := (v_entry ->> 'n')::integer;
      v_peak := (v_entry ->> 'p')::integer;
    end if;

    v_k := cfg.k_base
      + (cfg.k_provisional - cfg.k_base)
        * greatest(0, cfg.provisional_matches - v_played)::numeric
        / greatest(cfg.provisional_matches, 1);
    v_k := v_k * v_damping;

    if v_teams[v_i] = 1 then
      v_team_score := v_score1;
      v_team_expected := v_expected1;
    else
      v_team_score := 1 - v_score1;
      v_team_expected := 1 - v_expected1;
    end if;

    v_partner := null;
    for v_j in 1 .. v_count loop
      if v_j <> v_i and v_teams[v_j] = v_teams[v_i] then
        v_partner := v_ratings[v_j];
      end if;
    end loop;

    v_factor := 1.0;
    if v_partner is not null and v_team_score <> 0.5 then
      v_split := least(
        cfg.pair_split_max,
        abs(v_ratings[v_i] - v_partner) / cfg.pair_split_scale
      );
      if v_ratings[v_i] < v_partner then
        v_split_sign := 1;
      elsif v_ratings[v_i] > v_partner then
        v_split_sign := -1;
      else
        v_split_sign := 0;
      end if;
      if v_team_score = 1 then
        v_factor := 1 + v_split_sign * v_split;
      else
        v_factor := 1 - v_split_sign * v_split;
      end if;
    end if;

    v_delta := round(
      v_k * v_mov * (v_team_score - v_team_expected) * v_factor
    )::integer;
    v_after := v_before + v_delta;

    insert into public.rating_events (
      match_id, profile_id, played_at, seq, match_index,
      rating_before, rating_after, delta, expected, k_used
    )
    values (
      p_match_id, v_ids[v_i], p_played_at, v_seq, v_played + 1,
      v_before, v_after, v_delta, round(v_team_expected, 4), round(v_k, 2)
    );

    if v_after > v_peak then
      v_peak := v_after;
    end if;

    v_state := jsonb_set(
      v_state,
      array[v_ids[v_i]::text],
      jsonb_build_object('r', v_after, 'n', v_played + 1, 'p', v_peak),
      true
    );
  end loop;

  return v_state;
end;
$$;

create or replace function private.upsert_player_ratings(p_state jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.player_ratings (
    profile_id, rating, matches_rated, peak_rating, updated_at
  )
  select
    key::uuid,
    (value ->> 'r')::integer,
    (value ->> 'n')::integer,
    (value ->> 'p')::integer,
    now()
  from jsonb_each(coalesce(p_state, '{}'::jsonb))
  on conflict (profile_id) do update set
    rating = excluded.rating,
    matches_rated = excluded.matches_rated,
    peak_rating = excluded.peak_rating,
    updated_at = now();
end;
$$;

create or replace function private.rating_state_from_events()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start integer;
  v_state jsonb;
begin
  select start_rating into v_start from public.rating_settings where id;
  if v_start is null then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_object_agg(
    sub.profile_id::text,
    jsonb_build_object('r', sub.rating_after, 'n', sub.match_index, 'p', sub.peak)
  ), '{}'::jsonb)
  into v_state
  from (
    select
      e.profile_id,
      e.rating_after,
      e.match_index,
      greatest(
        v_start,
        (select max(e2.rating_after) from public.rating_events e2 where e2.profile_id = e.profile_id)
      ) as peak
    from public.rating_events e
    inner join (
      select profile_id, max(seq) as seq
      from public.rating_events
      group by profile_id
    ) last_ev on last_ev.profile_id = e.profile_id and last_ev.seq = e.seq
  ) sub;

  return v_state;
end;
$$;

-- Replay rated matches from a sort-key cutoff (inclusive). Always uses a WHERE
-- on deletes so API sessions with safeupdate can run this.
create or replace function private.refresh_ratings_from(
  p_from_played_at timestamptz,
  p_from_created_at timestamptz,
  p_from_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_match record;
begin
  if not exists (select 1 from public.rating_settings where id) then
    return;
  end if;

  delete from public.rating_events e
  using public.matches m
  where e.match_id = m.id
    and (m.played_at, m.created_at, m.id)
      >= (p_from_played_at, p_from_created_at, p_from_match_id);

  v_state := private.rating_state_from_events();

  for v_match in
    select m.id, m.played_at
    from public.matches m
    where m.status = 'played'
      and exists (select 1 from public.match_sets s where s.match_id = m.id)
      and not exists (
        select 1 from public.match_result_corrections c where c.match_id = m.id
      )
      and (m.played_at, m.created_at, m.id)
        >= (p_from_played_at, p_from_created_at, p_from_match_id)
    order by m.played_at, m.created_at, m.id
  loop
    v_state := private.apply_rating_match(v_match.id, v_match.played_at, v_state);
  end loop;

  perform private.upsert_player_ratings(v_state);

  delete from public.player_ratings p
  where not exists (
    select 1 from public.rating_events e where e.profile_id = p.profile_id
  );
end;
$$;

create or replace function private.refresh_ratings_for_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_played_at timestamptz;
  v_created_at timestamptz;
  v_id uuid;
  v_rated boolean;
  v_last_played_at timestamptz;
  v_last_created_at timestamptz;
  v_last_id uuid;
  v_state jsonb;
begin
  select
    m.played_at,
    m.created_at,
    m.id,
    m.status = 'played'
      and exists (select 1 from public.match_sets s where s.match_id = m.id)
      and not exists (
        select 1 from public.match_result_corrections c where c.match_id = m.id
      )
  into v_played_at, v_created_at, v_id, v_rated
  from public.matches m
  where m.id = p_match_id;

  if v_id is null then
    return;
  end if;

  select m.played_at, m.created_at, m.id
  into v_last_played_at, v_last_created_at, v_last_id
  from public.rating_events e
  join public.matches m on m.id = e.match_id
  order by e.seq desc
  limit 1;

  if v_rated and (
    v_last_id is null
    or (v_played_at, v_created_at, v_id)
      > (v_last_played_at, v_last_created_at, v_last_id)
  ) then
    select coalesce((
      select jsonb_object_agg(
        pr.profile_id::text,
        jsonb_build_object(
          'r', pr.rating,
          'n', pr.matches_rated,
          'p', pr.peak_rating
        )
      )
      from public.player_ratings pr
      join public.match_players mp
        on mp.profile_id = pr.profile_id
       and mp.match_id = p_match_id
    ), '{}'::jsonb)
    into v_state;

    v_state := private.apply_rating_match(p_match_id, v_played_at, v_state);
    perform private.upsert_player_ratings(v_state);
    return;
  end if;

  perform private.refresh_ratings_from(v_played_at, v_created_at, v_id);
end;
$$;

create or replace function private.recalculate_ratings()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb := '{}'::jsonb;
  v_match record;
begin
  if not exists (select 1 from public.rating_settings where id) then
    return;
  end if;

  delete from public.rating_events where true;
  delete from public.player_ratings where true;

  for v_match in
    select m.id, m.played_at
    from public.matches m
    where m.status = 'played'
      and exists (select 1 from public.match_sets s where s.match_id = m.id)
      and not exists (
        select 1 from public.match_result_corrections c where c.match_id = m.id
      )
    order by m.played_at, m.created_at, m.id
  loop
    v_state := private.apply_rating_match(v_match.id, v_match.played_at, v_state);
  end loop;

  perform private.upsert_player_ratings(v_state);
end;
$$;

create or replace function public.create_match(
  p_status text,
  p_played_at timestamptz,
  p_partner jsonb,
  p_opponent1 jsonb,
  p_opponent2 jsonb,
  p_sets jsonb
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
    p_status, p_played_at, p_partner, p_opponent1, p_opponent2, p_sets
  );
  if p_status = 'played' then
    perform private.refresh_ratings_for_match(v_result);
  end if;
  return v_result;
end;
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
  return v_result;
end;
$$;

create or replace function public.create_league_match(
  p_fixture_id uuid,
  p_status text,
  p_played_at timestamptz,
  p_sets jsonb
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
    p_fixture_id, p_status, p_played_at, p_sets
  );
  if p_status = 'played' then
    perform private.refresh_ratings_for_match(v_result);
  end if;
  return v_result;
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

create or replace function public.delete_match(p_match_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_played_at timestamptz;
  v_created_at timestamptz;
  v_id uuid;
  v_rated boolean;
  v_result boolean;
begin
  select
    m.played_at,
    m.created_at,
    m.id,
    m.status = 'played'
      and exists (select 1 from public.match_sets s where s.match_id = m.id)
      and not exists (
        select 1 from public.match_result_corrections c where c.match_id = m.id
      )
  into v_played_at, v_created_at, v_id, v_rated
  from public.matches m
  where m.id = p_match_id;

  v_result := private.delete_match(p_match_id);

  if v_rated then
    perform private.refresh_ratings_from(v_played_at, v_created_at, v_id);
  end if;
  return v_result;
end;
$$;

create or replace function public.propose_match_result_correction(
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
  v_result := private.propose_match_result_correction(p_match_id, p_sets, p_players);
  perform private.refresh_ratings_for_match(p_match_id);
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
  return v_result;
end;
$$;

create or replace function public.reject_match_result_correction(p_match_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result boolean;
begin
  v_result := private.reject_match_result_correction(p_match_id);
  perform private.refresh_ratings_for_match(p_match_id);
  return v_result;
end;
$$;

create or replace function public.withdraw_match_result_correction(p_match_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result boolean;
begin
  v_result := private.withdraw_match_result_correction(p_match_id);
  perform private.refresh_ratings_for_match(p_match_id);
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
  return v_result;
end;
$$;

grant execute on function private.apply_rating_match(uuid, timestamptz, jsonb) to authenticated;
grant execute on function private.upsert_player_ratings(jsonb) to authenticated;
grant execute on function private.rating_state_from_events() to authenticated;
grant execute on function private.refresh_ratings_from(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function private.refresh_ratings_for_match(uuid) to authenticated;
grant execute on function private.recalculate_ratings() to authenticated;
grant execute on function public.create_matchmaker_court_match(uuid, integer, timestamptz, uuid[]) to authenticated;
