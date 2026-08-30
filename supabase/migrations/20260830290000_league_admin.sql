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

  return new_id;
end;
$$;

create or replace function private.update_league(
  p_league_id uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_signup_deadline timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text;
  updated_count integer;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if p_starts_on is null or p_ends_on is null or p_signup_deadline is null then
    raise exception 'LEAGUE_DATES_REQUIRED';
  end if;

  if p_ends_on < p_starts_on then
    raise exception 'LEAGUE_DATES_INVALID';
  end if;

  cleaned := left(trim(coalesce(p_name, '')), 80);
  if cleaned = '' then
    cleaned := 'Liga';
  end if;

  update public.leagues
  set
    name = cleaned,
    starts_on = p_starts_on,
    ends_on = p_ends_on,
    signup_deadline = p_signup_deadline
  where id = p_league_id;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'LEAGUE_NOT_FOUND';
  end if;

  return true;
end;
$$;

create or replace function private.close_league_signup(p_league_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  update public.leagues
  set signup_deadline = now() - interval '1 second'
  where id = p_league_id
    and signup_deadline >= now();

  get diagnostics updated_count = row_count;
  if not exists (select 1 from public.leagues where id = p_league_id) then
    raise exception 'LEAGUE_NOT_FOUND';
  end if;

  if updated_count = 0 then
    raise exception 'SIGNUP_ALREADY_CLOSED';
  end if;

  return true;
end;
$$;

create or replace function private.remove_league_team(p_team_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  delete from public.league_teams
  where id = p_team_id;

  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then
    raise exception 'LEAGUE_TEAM_NOT_FOUND';
  end if;

  return true;
end;
$$;

create or replace function public.update_league(
  p_league_id uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_signup_deadline timestamptz
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.update_league(
    p_league_id,
    p_name,
    p_starts_on,
    p_ends_on,
    p_signup_deadline
  );
$$;

create or replace function public.close_league_signup(p_league_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.close_league_signup(p_league_id);
$$;

create or replace function public.remove_league_team(p_team_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.remove_league_team(p_team_id);
$$;

grant execute on function private.update_league(uuid, text, date, date, timestamptz) to authenticated;
grant execute on function private.close_league_signup(uuid) to authenticated;
grant execute on function private.remove_league_team(uuid) to authenticated;
grant execute on function public.update_league(uuid, text, date, date, timestamptz) to authenticated;
grant execute on function public.close_league_signup(uuid) to authenticated;
grant execute on function public.remove_league_team(uuid) to authenticated;
