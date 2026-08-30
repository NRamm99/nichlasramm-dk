alter table public.match_result_corrections
  add column if not exists players jsonb;

create or replace function private.match_players_as_json(p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'team', team,
        'slot', slot,
        'profile_id', profile_id,
        'guest_name', guest_name
      )
      order by team, slot
    ),
    '[]'::jsonb
  )
  from public.match_players
  where match_id = p_match_id;
$$;

create or replace function private.normalize_match_players(
  p_players jsonb,
  p_require_self boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  row jsonb;
  parsed record;
  team_no integer;
  slot_no integer;
  seen text := '';
  key text;
  normalized jsonb := '[]'::jsonb;
  has_self boolean := false;
begin
  if p_players is null or jsonb_typeof(p_players) <> 'array'
     or jsonb_array_length(p_players) <> 4 then
    raise exception 'PLAYER_REQUIRED';
  end if;

  for row in
    select value
    from jsonb_array_elements(p_players)
    order by (value ->> 'team')::int, (value ->> 'slot')::int
  loop
    team_no := coalesce((row ->> 'team')::int, 0);
    slot_no := coalesce((row ->> 'slot')::int, 0);
    if team_no not in (1, 2) or slot_no not in (1, 2) then
      raise exception 'PLAYER_REQUIRED';
    end if;

    key := team_no::text || '-' || slot_no::text;
    if position(key in seen) > 0 then
      raise exception 'PLAYER_REQUIRED';
    end if;
    seen := seen || ' ' || key;

    select * into parsed from private.player_from_json(row);
    if parsed.profile_id is not null and parsed.profile_id = auth.uid() then
      has_self := true;
    end if;

    normalized := normalized || jsonb_build_array(
      jsonb_build_object(
        'team', team_no,
        'slot', slot_no,
        'profile_id', parsed.profile_id,
        'guest_name', parsed.guest_name
      )
    );
  end loop;

  if seen not like '%1-1%' or seen not like '%1-2%'
     or seen not like '%2-1%' or seen not like '%2-2%' then
    raise exception 'PLAYER_REQUIRED';
  end if;

  if p_require_self and not has_self then
    raise exception 'MUST_STAY_IN_MATCH';
  end if;

  return normalized;
end;
$$;

create or replace function private.replace_match_players(
  p_match_id uuid,
  p_players jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  row jsonb;
begin
  delete from public.match_players where match_id = p_match_id;
  for row in select value from jsonb_array_elements(p_players)
  loop
    perform private.insert_match_player(
      p_match_id,
      (row ->> 'team')::int,
      (row ->> 'slot')::int,
      row
    );
  end loop;
end;
$$;

create or replace function private.player_list_line(p_players jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  row jsonb;
  parsed record;
  parts text := '';
begin
  if p_players is null or jsonb_typeof(p_players) <> 'array' then
    return '';
  end if;

  for row in
    select value
    from jsonb_array_elements(p_players)
    order by (value ->> 'team')::int, (value ->> 'slot')::int
  loop
    select * into parsed from private.player_from_json(row);
    if parts <> '' then
      parts := parts || ', ';
    end if;
    parts := parts || parsed.display_name;
  end loop;

  return parts;
end;
$$;

create or replace function private.is_league_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_fixtures where match_id = p_match_id
  );
$$;

drop function if exists public.propose_match_result_correction(uuid, jsonb);
drop function if exists private.propose_match_result_correction(uuid, jsonb);

create or replace function private.propose_match_result_correction(
  p_match_id uuid,
  p_sets jsonb,
  p_players jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  current_sets jsonb;
  current_players jsonb;
  next_sets jsonb;
  next_players jsonb;
  pending_by uuid;
  other_members integer;
  has_result boolean;
  sets_changed boolean;
  players_changed boolean;
  line text;
  note text;
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

  current_sets := private.match_sets_as_json(p_match_id);
  current_players := private.match_players_as_json(p_match_id);
  has_result := jsonb_array_length(current_sets) >= 1;

  if p_players is null then
    next_players := current_players;
  else
    next_players := private.normalize_match_players(p_players, true);
  end if;

  if private.is_league_match(p_match_id)
     and next_players is distinct from current_players then
    raise exception 'LEAGUE_ROSTER_LOCKED';
  end if;

  if has_result then
    perform private.assert_match_sets(p_sets);
    next_sets := p_sets;
  else
    next_sets := '[]'::jsonb;
  end if;

  sets_changed := has_result and current_sets is distinct from next_sets;
  players_changed := next_players is distinct from current_players;

  if not sets_changed and not players_changed then
    raise exception 'RESULT_UNCHANGED';
  end if;

  select proposed_by into pending_by
  from public.match_result_corrections
  where match_id = p_match_id;

  if pending_by is not null and pending_by <> current_id then
    raise exception 'CORRECTION_PENDING';
  end if;

  select count(*) into other_members
  from public.match_players
  where match_id = p_match_id
    and profile_id is not null
    and profile_id <> current_id;

  line := private.set_list_line(next_sets);

  if other_members = 0 then
    if players_changed then
      perform private.replace_match_players(p_match_id, next_players);
    end if;
    if sets_changed then
      perform private.replace_match_sets(p_match_id, next_sets);
    end if;
    delete from public.match_result_corrections where match_id = p_match_id;
    if sets_changed and players_changed then
      note := 'Rettede resultatet til ' || line || ' og spillerne.';
    elsif players_changed then
      note := 'Rettede spillerne til ' || private.player_list_line(next_players) || '.';
    else
      note := 'Rettede resultatet til ' || line || '.';
    end if;
    perform private.add_result_note(p_match_id, note);
    return true;
  end if;

  insert into public.match_result_corrections (match_id, proposed_by, sets, players)
  values (p_match_id, current_id, next_sets, next_players)
  on conflict (match_id) do update
    set proposed_by = excluded.proposed_by,
        sets = excluded.sets,
        players = excluded.players,
        created_at = now();

  if sets_changed and players_changed then
    note := 'Foreslog nyt resultat: ' || line || ' og nye spillere. Afventer det andet hold.';
  elsif players_changed then
    note := 'Foreslog nye spillere: ' || private.player_list_line(next_players) || '. Afventer det andet hold.';
  else
    note := 'Foreslog nyt resultat: ' || line || '. Afventer det andet hold.';
  end if;
  perform private.add_result_note(p_match_id, note);
  return true;
end;
$$;

create or replace function private.accept_match_result_correction(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_by uuid;
  pending_sets jsonb;
  pending_players jsonb;
  line text;
begin
  if not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select proposed_by, sets, players
  into pending_by, pending_sets, pending_players
  from public.match_result_corrections
  where match_id = p_match_id;

  if pending_by is null then
    raise exception 'NO_CORRECTION';
  end if;

  if not private.can_confirm_result_correction(p_match_id, pending_by) then
    raise exception 'NOT_OTHER_TEAM';
  end if;

  if pending_players is not null then
    perform private.replace_match_players(
      p_match_id,
      private.normalize_match_players(pending_players, false)
    );
  end if;
  if pending_sets is not null and jsonb_typeof(pending_sets) = 'array'
     and jsonb_array_length(pending_sets) >= 1 then
    perform private.replace_match_sets(p_match_id, pending_sets);
  end if;
  delete from public.match_result_corrections where match_id = p_match_id;
  line := private.set_list_line(pending_sets);
  if pending_players is not null and line <> '' then
    perform private.add_result_note(
      p_match_id,
      'Godkendte rettelsen: ' || line || ' og nye spillere.'
    );
  elsif pending_players is not null then
    perform private.add_result_note(p_match_id, 'Godkendte de nye spillere.');
  else
    perform private.add_result_note(
      p_match_id,
      'Godkendte det nye resultat: ' || line || '.'
    );
  end if;
  return true;
end;
$$;

drop function if exists public.replace_match_result(uuid, jsonb);
drop function if exists private.replace_match_result(uuid, jsonb);

create or replace function private.replace_match_result(
  p_match_id uuid,
  p_sets jsonb,
  p_players jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_sets jsonb;
  next_players jsonb;
  line text;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if not exists (select 1 from public.matches where id = p_match_id) then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  current_sets := private.match_sets_as_json(p_match_id);
  if jsonb_array_length(current_sets) < 1 then
    raise exception 'CORRECTION_NEEDS_RESULT';
  end if;

  if p_players is not null then
    if private.is_league_match(p_match_id) then
      raise exception 'LEAGUE_ROSTER_LOCKED';
    end if;
    next_players := private.normalize_match_players(p_players, false);
    perform private.replace_match_players(p_match_id, next_players);
  end if;

  perform private.replace_match_sets(p_match_id, p_sets);
  delete from public.match_result_corrections where match_id = p_match_id;
  line := private.set_list_line(p_sets);
  perform private.add_result_note(
    p_match_id,
    'Administratoren rettede kampen til ' || line || '.'
  );
  return true;
end;
$$;

create or replace function public.propose_match_result_correction(
  p_match_id uuid,
  p_sets jsonb,
  p_players jsonb default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.propose_match_result_correction(p_match_id, p_sets, p_players);
$$;

create or replace function public.replace_match_result(
  p_match_id uuid,
  p_sets jsonb,
  p_players jsonb default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.replace_match_result(p_match_id, p_sets, p_players);
$$;

grant execute on function private.match_players_as_json(uuid) to authenticated;
grant execute on function private.normalize_match_players(jsonb, boolean) to authenticated;
grant execute on function private.replace_match_players(uuid, jsonb) to authenticated;
grant execute on function private.player_list_line(jsonb) to authenticated;
grant execute on function private.is_league_match(uuid) to authenticated;
grant execute on function private.propose_match_result_correction(uuid, jsonb, jsonb) to authenticated;
grant execute on function private.replace_match_result(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.propose_match_result_correction(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.replace_match_result(uuid, jsonb, jsonb) to authenticated;
