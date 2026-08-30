create or replace function private.player_from_json(p_player jsonb)
returns table (profile_id uuid, guest_name text, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member_id uuid;
  guest text;
  member_id_found uuid;
  member_first text;
  member_last text;
  member_username text;
begin
  if p_player is null or p_player = 'null'::jsonb then
    raise exception 'PLAYER_REQUIRED';
  end if;

  if p_player ? 'profile_id' and coalesce(p_player ->> 'profile_id', '') <> '' then
    member_id := (p_player ->> 'profile_id')::uuid;

    select p.id, p.first_name, p.last_name, p.username
    into member_id_found, member_first, member_last, member_username
    from public.profiles p
    where p.id = member_id
      and p.banned_at is null;

    if member_id_found is null then
      raise exception 'MEMBER_NOT_FOUND';
    end if;

    profile_id := member_id_found;
    guest_name := null;
    display_name := nullif(trim(concat_ws(' ', member_first, member_last)), '');
    if display_name is null then
      display_name := coalesce(member_username, 'Ukendt');
    end if;
    return next;
    return;
  end if;

  guest := left(trim(coalesce(p_player ->> 'guest_name', '')), 80);
  if guest = '' then
    raise exception 'PLAYER_REQUIRED';
  end if;

  profile_id := null;
  guest_name := guest;
  display_name := guest;
  return next;
end;
$$;

create or replace function private.insert_match_player(
  p_match_id uuid,
  p_team integer,
  p_slot integer,
  p_player jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  parsed record;
begin
  select * into parsed from private.player_from_json(p_player);

  insert into public.match_players (
    match_id, team, slot, profile_id, guest_name, display_name
  )
  values (
    p_match_id, p_team, p_slot, parsed.profile_id, parsed.guest_name, parsed.display_name
  );
exception
  when unique_violation then
    raise exception 'DUPLICATE_PLAYER';
end;
$$;

create or replace function private.insert_match_sets(p_match_id uuid, p_sets jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  set_row jsonb;
  set_no integer := 0;
  games1 integer;
  games2 integer;
begin
  if p_sets is null or jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) < 1 then
    raise exception 'MATCH_SETS_REQUIRED';
  end if;

  if jsonb_array_length(p_sets) > 5 then
    raise exception 'TOO_MANY_SETS';
  end if;

  for set_row in select value from jsonb_array_elements(p_sets)
  loop
    set_no := set_no + 1;
    games1 := coalesce((set_row ->> 'team1')::int, -1);
    games2 := coalesce((set_row ->> 'team2')::int, -1);

    if games1 < 0 or games1 > 7 or games2 < 0 or games2 > 7
       or games1 = games2
       or greatest(games1, games2) < 6 then
      raise exception 'INVALID_SET';
    end if;

    insert into public.match_sets (match_id, set_number, team1_games, team2_games)
    values (p_match_id, set_no, games1, games2);
  end loop;
end;
$$;

create or replace function private.create_match(
  p_status text,
  p_played_at timestamptz,
  p_partner jsonb,
  p_opponent1 jsonb,
  p_opponent2 jsonb,
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
  self_json jsonb;
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

  insert into public.matches (created_by, played_at, status)
  values (current_id, p_played_at, p_status)
  returning id into new_id;

  self_json := jsonb_build_object('profile_id', current_id);
  perform private.insert_match_player(new_id, 1, 1, self_json);
  perform private.insert_match_player(new_id, 1, 2, p_partner);
  perform private.insert_match_player(new_id, 2, 1, p_opponent1);
  perform private.insert_match_player(new_id, 2, 2, p_opponent2);

  if p_status = 'played' then
    perform private.insert_match_sets(new_id, p_sets);
  elsif p_sets is not null and p_sets <> 'null'::jsonb and jsonb_typeof(p_sets) = 'array' and jsonb_array_length(p_sets) > 0 then
    raise exception 'FUTURE_MATCH_NO_RESULT';
  end if;

  return new_id;
end;
$$;

create or replace function private.record_match_result(p_match_id uuid, p_sets jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not private.is_match_participant(p_match_id) then
    raise exception 'NOT_MATCH_PLAYER';
  end if;

  if not exists (select 1 from public.matches where id = p_match_id) then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if exists (select 1 from public.match_sets where match_id = p_match_id) then
    raise exception 'RESULT_ALREADY_SET';
  end if;

  perform private.insert_match_sets(p_match_id, p_sets);

  update public.matches
  set status = 'played'
  where id = p_match_id;

  return true;
end;
$$;

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

  return new_id;
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
language sql
security invoker
set search_path = ''
as $$
  select private.create_match(p_status, p_played_at, p_partner, p_opponent1, p_opponent2, p_sets);
$$;

create or replace function public.record_match_result(p_match_id uuid, p_sets jsonb)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.record_match_result(p_match_id, p_sets);
$$;

create or replace function public.add_match_comment(p_match_id uuid, p_body text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.add_match_comment(p_match_id, p_body);
$$;

grant execute on function private.is_active_member() to authenticated;
grant execute on function private.is_match_participant(uuid) to authenticated;
grant execute on function private.player_from_json(jsonb) to authenticated;
grant execute on function private.insert_match_player(uuid, integer, integer, jsonb) to authenticated;
grant execute on function private.insert_match_sets(uuid, jsonb) to authenticated;
grant execute on function private.create_match(text, timestamptz, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function private.record_match_result(uuid, jsonb) to authenticated;
grant execute on function private.add_match_comment(uuid, text) to authenticated;

grant execute on function public.create_match(text, timestamptz, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.record_match_result(uuid, jsonb) to authenticated;
grant execute on function public.add_match_comment(uuid, text) to authenticated;
