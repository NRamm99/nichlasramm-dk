create table if not exists public.match_result_corrections (
  match_id uuid primary key references public.matches (id) on delete cascade,
  proposed_by uuid not null references public.profiles (id) on delete cascade,
  sets jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.match_result_corrections enable row level security;

revoke all on table public.match_result_corrections from anon, authenticated;
grant select on table public.match_result_corrections to authenticated;

drop policy if exists match_result_corrections_select_members
  on public.match_result_corrections;
create policy match_result_corrections_select_members
  on public.match_result_corrections
  for select
  to authenticated
  using (private.is_active_member());

create or replace function private.match_sets_as_json(p_match_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('team1', team1_games, 'team2', team2_games)
      order by set_number
    ),
    '[]'::jsonb
  )
  from public.match_sets
  where match_id = p_match_id;
$$;

create or replace function private.set_list_line(p_sets jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  set_row jsonb;
  games1 integer;
  games2 integer;
  parts text := '';
  complete boolean;
begin
  if p_sets is null or jsonb_typeof(p_sets) <> 'array' then
    return '';
  end if;

  for set_row in select value from jsonb_array_elements(p_sets)
  loop
    games1 := coalesce((set_row ->> 'team1')::int, 0);
    games2 := coalesce((set_row ->> 'team2')::int, 0);
    complete := games1 <> games2 and greatest(games1, games2) >= 6;
    if parts <> '' then
      parts := parts || ', ';
    end if;
    parts := parts || games1::text || '–' || games2::text;
    if not complete then
      parts := parts || '*';
    end if;
  end loop;

  return parts;
end;
$$;

create or replace function private.assert_match_sets(p_sets jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  set_row jsonb;
  set_no integer := 0;
  total integer;
  games1 integer;
  games2 integer;
  complete boolean;
begin
  if p_sets is null or jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) < 1 then
    raise exception 'MATCH_SETS_REQUIRED';
  end if;

  total := jsonb_array_length(p_sets);
  if total > 5 then
    raise exception 'TOO_MANY_SETS';
  end if;

  for set_row in select value from jsonb_array_elements(p_sets)
  loop
    set_no := set_no + 1;
    games1 := coalesce((set_row ->> 'team1')::int, -1);
    games2 := coalesce((set_row ->> 'team2')::int, -1);

    if games1 < 0 or games1 > 7 or games2 < 0 or games2 > 7 then
      raise exception 'INVALID_SET';
    end if;

    complete := games1 <> games2 and greatest(games1, games2) >= 6;
    if not complete and set_no <> total then
      raise exception 'UNFINISHED_SET_NOT_LAST';
    end if;
  end loop;
end;
$$;

create or replace function private.replace_match_sets(p_match_id uuid, p_sets jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_match_sets(p_sets);
  delete from public.match_sets where match_id = p_match_id;
  perform private.insert_match_sets(p_match_id, p_sets);
end;
$$;

create or replace function private.add_result_note(p_match_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text;
begin
  if auth.uid() is null then
    return;
  end if;

  cleaned := left(trim(coalesce(p_body, '')), 1000);
  if cleaned = '' then
    return;
  end if;

  insert into public.match_comments (match_id, author_id, body)
  values (p_match_id, auth.uid(), cleaned);
end;
$$;

create or replace function private.can_confirm_result_correction(
  p_match_id uuid,
  p_proposed_by uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  proposer_team smallint;
  my_team smallint;
  has_opposing boolean;
begin
  if private.is_admin() then
    return true;
  end if;

  if auth.uid() is null or auth.uid() = p_proposed_by then
    return false;
  end if;

  if not private.is_match_participant(p_match_id) then
    return false;
  end if;

  select team into proposer_team
  from public.match_players
  where match_id = p_match_id
    and profile_id = p_proposed_by;

  select team into my_team
  from public.match_players
  where match_id = p_match_id
    and profile_id = auth.uid();

  select exists (
    select 1
    from public.match_players
    where match_id = p_match_id
      and profile_id is not null
      and team is distinct from proposer_team
  ) into has_opposing;

  if has_opposing then
    return my_team is distinct from proposer_team;
  end if;

  return true;
end;
$$;

create or replace function private.propose_match_result_correction(
  p_match_id uuid,
  p_sets jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  current_sets jsonb;
  pending_by uuid;
  other_members integer;
  line text;
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
  if jsonb_array_length(current_sets) < 1 then
    raise exception 'CORRECTION_NEEDS_RESULT';
  end if;

  perform private.assert_match_sets(p_sets);

  if current_sets = p_sets then
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

  line := private.set_list_line(p_sets);

  if other_members = 0 then
    perform private.replace_match_sets(p_match_id, p_sets);
    delete from public.match_result_corrections where match_id = p_match_id;
    perform private.add_result_note(
      p_match_id,
      'Rettede resultatet til ' || line || '.'
    );
    return true;
  end if;

  insert into public.match_result_corrections (match_id, proposed_by, sets)
  values (p_match_id, current_id, p_sets)
  on conflict (match_id) do update
    set proposed_by = excluded.proposed_by,
        sets = excluded.sets,
        created_at = now();

  perform private.add_result_note(
    p_match_id,
    'Foreslog nyt resultat: ' || line || '. Afventer det andet hold.'
  );
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
  line text;
begin
  if not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select proposed_by, sets
  into pending_by, pending_sets
  from public.match_result_corrections
  where match_id = p_match_id;

  if pending_by is null then
    raise exception 'NO_CORRECTION';
  end if;

  if not private.can_confirm_result_correction(p_match_id, pending_by) then
    raise exception 'NOT_OTHER_TEAM';
  end if;

  perform private.replace_match_sets(p_match_id, pending_sets);
  delete from public.match_result_corrections where match_id = p_match_id;
  line := private.set_list_line(pending_sets);
  perform private.add_result_note(
    p_match_id,
    'Godkendte det nye resultat: ' || line || '.'
  );
  return true;
end;
$$;

create or replace function private.reject_match_result_correction(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_by uuid;
begin
  if not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select proposed_by into pending_by
  from public.match_result_corrections
  where match_id = p_match_id;

  if pending_by is null then
    raise exception 'NO_CORRECTION';
  end if;

  if auth.uid() = pending_by then
    raise exception 'CANNOT_REJECT_OWN';
  end if;

  if not private.is_admin() and not private.is_match_participant(p_match_id) then
    raise exception 'NOT_MATCH_PLAYER';
  end if;

  delete from public.match_result_corrections where match_id = p_match_id;
  perform private.add_result_note(p_match_id, 'Afviste rettelsen. Det gamle resultat står.');
  return true;
end;
$$;

create or replace function private.withdraw_match_result_correction(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_by uuid;
begin
  if not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select proposed_by into pending_by
  from public.match_result_corrections
  where match_id = p_match_id;

  if pending_by is null then
    raise exception 'NO_CORRECTION';
  end if;

  if pending_by <> auth.uid() and not private.is_admin() then
    raise exception 'NOT_PROPOSER';
  end if;

  delete from public.match_result_corrections where match_id = p_match_id;
  perform private.add_result_note(p_match_id, 'Trak rettelsen tilbage.');
  return true;
end;
$$;

create or replace function private.replace_match_result(p_match_id uuid, p_sets jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  line text;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if not exists (select 1 from public.matches where id = p_match_id) then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if jsonb_array_length(private.match_sets_as_json(p_match_id)) < 1 then
    raise exception 'CORRECTION_NEEDS_RESULT';
  end if;

  perform private.replace_match_sets(p_match_id, p_sets);
  delete from public.match_result_corrections where match_id = p_match_id;
  line := private.set_list_line(p_sets);
  perform private.add_result_note(
    p_match_id,
    'Administratoren satte resultatet til ' || line || '.'
  );
  return true;
end;
$$;

create or replace function public.propose_match_result_correction(
  p_match_id uuid,
  p_sets jsonb
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.propose_match_result_correction(p_match_id, p_sets);
$$;

create or replace function public.accept_match_result_correction(p_match_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.accept_match_result_correction(p_match_id);
$$;

create or replace function public.reject_match_result_correction(p_match_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.reject_match_result_correction(p_match_id);
$$;

create or replace function public.withdraw_match_result_correction(p_match_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.withdraw_match_result_correction(p_match_id);
$$;

create or replace function public.replace_match_result(p_match_id uuid, p_sets jsonb)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.replace_match_result(p_match_id, p_sets);
$$;

grant execute on function private.match_sets_as_json(uuid) to authenticated;
grant execute on function private.set_list_line(jsonb) to authenticated;
grant execute on function private.assert_match_sets(jsonb) to authenticated;
grant execute on function private.replace_match_sets(uuid, jsonb) to authenticated;
grant execute on function private.add_result_note(uuid, text) to authenticated;
grant execute on function private.can_confirm_result_correction(uuid, uuid) to authenticated;
grant execute on function private.propose_match_result_correction(uuid, jsonb) to authenticated;
grant execute on function private.accept_match_result_correction(uuid) to authenticated;
grant execute on function private.reject_match_result_correction(uuid) to authenticated;
grant execute on function private.withdraw_match_result_correction(uuid) to authenticated;
grant execute on function private.replace_match_result(uuid, jsonb) to authenticated;

grant execute on function public.propose_match_result_correction(uuid, jsonb) to authenticated;
grant execute on function public.accept_match_result_correction(uuid) to authenticated;
grant execute on function public.reject_match_result_correction(uuid) to authenticated;
grant execute on function public.withdraw_match_result_correction(uuid) to authenticated;
grant execute on function public.replace_match_result(uuid, jsonb) to authenticated;
