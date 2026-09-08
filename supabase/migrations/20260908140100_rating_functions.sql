create or replace function private.rating_expected(p_a numeric, p_b numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select 1.0 / (1.0 + power(10.0, (p_b - p_a) / 400.0));
$$;

-- Padel is won by attacking the weaker player, so a pair is rated closer to its
-- weaker half than a plain average would suggest.
create or replace function private.rating_team_strength(
  p_first numeric,
  p_second numeric,
  p_weak_link_weight numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_first is null then p_second
    when p_second is null then p_first
    else p_weak_link_weight * least(p_first, p_second)
      + (1.0 - p_weak_link_weight) * greatest(p_first, p_second)
  end;
$$;

create or replace function private.rating_mov(
  p_game_diff integer,
  p_min numeric,
  p_max numeric,
  p_span integer
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select p_min
    + (p_max - p_min) * least(greatest(p_game_diff, 0), p_span)::numeric / p_span;
$$;

-- Ratings are order dependent and results can move underneath the timeline
-- (backdating, corrections, deletions, guest slots swapped to members), so the
-- whole history is replayed from scratch rather than applied incrementally.
create or replace function private.recalculate_ratings()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.rating_settings%rowtype;
  v_state jsonb := '{}'::jsonb;
  v_entry jsonb;
  v_match record;
  v_set record;
  v_seq integer := 0;
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
    return;
  end if;

  delete from public.rating_events;

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
    select
      array_agg(mp.profile_id order by mp.team, mp.slot),
      array_agg(mp.team order by mp.team, mp.slot)
    into v_ids, v_teams
    from public.match_players mp
    where mp.match_id = v_match.id;

    v_count := coalesce(array_length(v_teams, 1), 0);
    if v_count not in (2, 4) then
      continue;
    end if;
    if v_count = 2 and not cfg.include_singles then
      continue;
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
      continue;
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
      continue;
    end if;

    v_strength1 := private.rating_team_strength(
      v_team1_a, v_team1_b, cfg.weak_link_weight
    );
    v_strength2 := private.rating_team_strength(
      v_team2_a, v_team2_b, cfg.weak_link_weight
    );
    v_expected1 := private.rating_expected(v_strength1, v_strength2);

    -- Mirrors teamSetWins() in src/lib/match.ts: only complete sets count, but a
    -- trailing unfinished set breaks a tie.
    v_sets1 := 0;
    v_sets2 := 0;
    v_games1 := 0;
    v_games2 := 0;
    v_open1 := null;
    v_open2 := null;
    for v_set in
      select s.team1_games, s.team2_games
      from public.match_sets s
      where s.match_id = v_match.id
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

    -- A guest slot is only a guess at a rating, so every member in the match
    -- moves less than they otherwise would.
    v_damping := power(cfg.guest_damping, v_guests);

    if cfg.mov_enabled and v_sets1 <> v_sets2 then
      v_mov := private.rating_mov(
        abs(v_games1 - v_games2), cfg.mov_min, cfg.mov_max, cfg.mov_span
      );
    else
      v_mov := 1.0;
    end if;

    v_seq := v_seq + 1;

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

      -- The underdog earns more from a win, the favourite carries more of a loss.
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
        v_match.id, v_ids[v_i], v_match.played_at, v_seq, v_played + 1,
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
  end loop;

  delete from public.player_ratings;

  insert into public.player_ratings (
    profile_id, rating, matches_rated, peak_rating, updated_at
  )
  select
    key::uuid,
    (value ->> 'r')::integer,
    (value ->> 'n')::integer,
    (value ->> 'p')::integer,
    now()
  from jsonb_each(v_state);
end;
$$;

create or replace function public.recalculate_ratings()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  perform private.recalculate_ratings();
  return true;
end;
$$;

grant execute on function private.rating_expected(numeric, numeric) to authenticated;
grant execute on function private.rating_team_strength(numeric, numeric, numeric) to authenticated;
grant execute on function private.rating_mov(integer, numeric, numeric, integer) to authenticated;
grant execute on function private.recalculate_ratings() to authenticated;

grant execute on function public.recalculate_ratings() to authenticated;
