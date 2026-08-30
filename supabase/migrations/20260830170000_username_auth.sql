alter table public.profiles
  add column if not exists username text;

alter table public.invite_codes
  add column if not exists member_username text;

create unique index if not exists profiles_username_key
  on public.profiles (lower(username))
  where username is not null;

create or replace function private.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles
    where lower(username) = lower(trim(p_username))
  );
$$;

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.username_available(p_username);
$$;

grant execute on function private.username_available(text) to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite text;
  claimed uuid;
  first_name text;
  last_name text;
  username text;
begin
  invite := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  invite := regexp_replace(invite, '\s+', '', 'g');
  first_name := left(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), 80);
  last_name := left(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), 80);
  username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));

  if invite = '' then
    raise exception 'INVITE_REQUIRED';
  end if;

  if first_name = '' or last_name = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  if username !~ '^[a-z0-9._-]{3,24}$' then
    raise exception 'USERNAME_INVALID';
  end if;

  if exists (
    select 1
    from public.profiles as existing
    where lower(existing.username) = username
  ) then
    raise exception 'USERNAME_TAKEN';
  end if;

  insert into public.profiles (id, email, username, is_admin, first_name, last_name)
  values (new.id, null, username, false, first_name, last_name);

  update public.invite_codes
  set
    used_by = new.id,
    used_at = now(),
    member_username = username,
    member_first_name = first_name,
    member_last_name = last_name,
    member_email = null,
    banned_at = null
  where code = invite
    and used_by is null
  returning id into claimed;

  if claimed is null then
    raise exception 'INVITE_INVALID';
  end if;

  return new;
end;
$$;

create or replace function private.ban_member(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'CANNOT_BAN_SELF';
  end if;

  if exists (
    select 1
    from public.profiles
    where id = p_user_id
      and is_admin
  ) then
    raise exception 'CANNOT_BAN_ADMIN';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    return false;
  end if;

  update public.invite_codes ic
  set
    banned_at = now(),
    member_username = coalesce(ic.member_username, p.username),
    member_first_name = coalesce(ic.member_first_name, p.first_name),
    member_last_name = coalesce(ic.member_last_name, p.last_name),
    member_avatar_url = coalesce(ic.member_avatar_url, p.avatar_url),
    member_email = null
  from public.profiles p
  where ic.used_by = p.id
    and p.id = p_user_id;

  delete from auth.sessions where user_id = p_user_id;
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.identities where user_id = p_user_id;
  delete from auth.users where id = p_user_id;

  return true;
end;
$$;

update public.profiles
set
  username = 'ramm',
  email = null
where is_admin
  and username is null;

update auth.users
set
  email = 'ramm@users.padelbyramm.invalid',
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"username":"ramm"}'::jsonb
where id in (select id from public.profiles where is_admin);

update auth.identities
set identity_data = jsonb_set(
  coalesce(identity_data, '{}'::jsonb),
  '{email}',
  '"ramm@users.padelbyramm.invalid"'
)
where provider = 'email'
  and user_id in (select id from public.profiles where is_admin);

update public.profiles
set email = null
where email is not null;

update public.invite_codes
set member_email = null
where member_email is not null;
