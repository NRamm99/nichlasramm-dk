alter table public.profiles
  add column if not exists handed text,
  add column if not exists preferred_side text;

alter table public.profiles
  drop constraint if exists profiles_handed_check;

alter table public.profiles
  drop constraint if exists profiles_preferred_side_check;

alter table public.profiles
  add constraint profiles_handed_check
    check (handed is null or handed in ('left', 'right'));

alter table public.profiles
  add constraint profiles_preferred_side_check
    check (preferred_side is null or preferred_side in ('left', 'right'));

drop function if exists public.update_own_profile(text, text, text);
drop function if exists private.update_own_profile(text, text, text);

create or replace function private.update_own_profile(
  p_first_name text,
  p_last_name text,
  p_bio text,
  p_handed text default null,
  p_preferred_side text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  new_first text;
  new_last text;
  new_bio text;
  new_handed text;
  new_side text;
begin
  current_id := private.require_self();
  new_first := left(trim(coalesce(p_first_name, '')), 80);
  new_last := left(trim(coalesce(p_last_name, '')), 80);
  new_bio := left(trim(coalesce(p_bio, '')), 500);
  new_handed := nullif(lower(trim(coalesce(p_handed, ''))), '');
  new_side := nullif(lower(trim(coalesce(p_preferred_side, ''))), '');

  if new_first = '' or new_last = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  if new_handed is not null and new_handed not in ('left', 'right') then
    raise exception 'INVALID_PLAY_STYLE';
  end if;

  if new_side is not null and new_side not in ('left', 'right') then
    raise exception 'INVALID_PLAY_STYLE';
  end if;

  update public.profiles
  set
    first_name = new_first,
    last_name = new_last,
    bio = nullif(new_bio, ''),
    handed = new_handed,
    preferred_side = new_side
  where id = current_id;
end;
$$;

create or replace function public.update_own_profile(
  p_first_name text,
  p_last_name text,
  p_bio text,
  p_handed text default null,
  p_preferred_side text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_own_profile(
    p_first_name,
    p_last_name,
    p_bio,
    p_handed,
    p_preferred_side
  );
$$;

grant execute on function private.update_own_profile(text, text, text, text, text) to authenticated;
grant execute on function public.update_own_profile(text, text, text, text, text) to authenticated;
