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

  for recipient in
    select distinct profile_id
    from public.match_players
    where match_id = p_match_id and profile_id is not null
  loop
    perform private.notify(
      recipient,
      'match_result_correction',
      jsonb_build_object('match_id', p_match_id, 'href', '/kampe/' || p_match_id)
    );
  end loop;

  return true;
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

  perform private.notify(
    p_partner_id,
    'league_join_request',
    jsonb_build_object('league_id', p_league_id, 'href', '/liga')
  );

  return existing_id;
end;
$$;
