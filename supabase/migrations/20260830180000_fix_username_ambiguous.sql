create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_code text;
  claimed uuid;
  new_first_name text;
  new_last_name text;
  new_username text;
begin
  invite_code := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  invite_code := regexp_replace(invite_code, '\s+', '', 'g');
  new_first_name := left(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), 80);
  new_last_name := left(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), 80);
  new_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));

  if invite_code = '' then
    raise exception 'INVITE_REQUIRED';
  end if;

  if new_first_name = '' or new_last_name = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  if new_username !~ '^[a-z0-9._-]{3,24}$' then
    raise exception 'USERNAME_INVALID';
  end if;

  if exists (
    select 1
    from public.profiles as existing
    where lower(existing.username) = new_username
  ) then
    raise exception 'USERNAME_TAKEN';
  end if;

  insert into public.profiles (id, email, username, is_admin, first_name, last_name)
  values (new.id, null, new_username, false, new_first_name, new_last_name);

  update public.invite_codes
  set
    used_by = new.id,
    used_at = now(),
    member_username = new_username,
    member_first_name = new_first_name,
    member_last_name = new_last_name,
    member_email = null,
    banned_at = null
  where code = invite_code
    and used_by is null
  returning id into claimed;

  if claimed is null then
    raise exception 'INVITE_INVALID';
  end if;

  return new;
end;
$$;
