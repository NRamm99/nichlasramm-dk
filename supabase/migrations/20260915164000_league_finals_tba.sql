alter table public.leagues
  add column if not exists finals_tba boolean not null default false;

drop function if exists public.update_league_finals(uuid, date, timestamptz, text, text);
drop function if exists private.update_league_finals(uuid, date, timestamptz, text, text);

create or replace function private.update_league_finals(
  p_league_id uuid,
  p_finals_on date,
  p_finals_starts_at timestamptz,
  p_finals_venue text,
  p_finals_note text,
  p_finals_tba boolean default false
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
    finals_tba = coalesce(p_finals_tba, false),
    finals_on = p_finals_on,
    finals_starts_at = case
      when p_finals_starts_at is not null then p_finals_starts_at
      when p_finals_on is null then null
      else (p_finals_on::timestamp + interval '10 hours')
        at time zone 'Europe/Copenhagen'
    end,
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

create or replace function public.update_league_finals(
  p_league_id uuid,
  p_finals_on date,
  p_finals_starts_at timestamptz,
  p_finals_venue text,
  p_finals_note text,
  p_finals_tba boolean default false
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
    p_finals_note,
    p_finals_tba
  );
$$;

grant execute on function private.update_league_finals(uuid, date, timestamptz, text, text, boolean) to authenticated;
grant execute on function public.update_league_finals(uuid, date, timestamptz, text, text, boolean) to authenticated;
