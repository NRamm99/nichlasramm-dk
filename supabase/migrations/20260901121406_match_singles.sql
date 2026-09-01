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
  is_singles boolean;
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

  insert into public.matches (created_by, played_at, status)
  values (current_id, p_played_at, p_status)
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
  n integer;
begin
  if p_players is null or jsonb_typeof(p_players) <> 'array' then
    raise exception 'PLAYER_REQUIRED';
  end if;

  n := jsonb_array_length(p_players);
  if n not in (2, 4) then
    raise exception 'PLAYER_REQUIRED';
  end if;

  for row in
    select value
    from jsonb_array_elements(p_players)
    order by (value ->> 'team')::int, (value ->> 'slot')::int
  loop
    team_no := coalesce((row ->> 'team')::int, 0);
    slot_no := coalesce((row ->> 'slot')::int, 0);
    if team_no not in (1, 2) then
      raise exception 'PLAYER_REQUIRED';
    end if;
    if n = 2 then
      if slot_no <> 1 then
        raise exception 'PLAYER_REQUIRED';
      end if;
    elsif slot_no not in (1, 2) then
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

  if n = 2 then
    if seen not like '%1-1%' or seen not like '%2-1%' then
      raise exception 'PLAYER_REQUIRED';
    end if;
  elsif seen not like '%1-1%' or seen not like '%1-2%'
     or seen not like '%2-1%' or seen not like '%2-2%' then
    raise exception 'PLAYER_REQUIRED';
  end if;

  if p_require_self and not has_self then
    raise exception 'MUST_STAY_IN_MATCH';
  end if;

  return normalized;
end;
$$;
