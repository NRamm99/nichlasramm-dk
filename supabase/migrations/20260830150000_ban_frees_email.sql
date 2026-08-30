alter table public.invite_codes
  add column if not exists member_email text,
  add column if not exists member_first_name text,
  add column if not exists member_last_name text,
  add column if not exists member_avatar_url text,
  add column if not exists banned_at timestamptz;

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
begin
  invite := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  invite := regexp_replace(invite, '\s+', '', 'g');
  first_name := left(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), 80);
  last_name := left(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), 80);

  if invite = '' then
    raise exception 'INVITE_REQUIRED';
  end if;

  if first_name = '' or last_name = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  insert into public.profiles (id, email, is_admin, first_name, last_name)
  values (new.id, new.email, false, first_name, last_name);

  update public.invite_codes
  set
    used_by = new.id,
    used_at = now(),
    member_email = new.email,
    member_first_name = first_name,
    member_last_name = last_name,
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

create or replace function private.set_own_avatar(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.profiles
  set avatar_url = p_url
  where id = auth.uid()
    and banned_at is null;

  update public.invite_codes
  set member_avatar_url = p_url
  where used_by = auth.uid();
end;
$$;

create or replace function private.ban_member(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
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

  select email into target_email
  from public.profiles
  where id = p_user_id;

  if target_email is null then
    return false;
  end if;

  update public.invite_codes ic
  set
    banned_at = now(),
    member_email = coalesce(ic.member_email, p.email),
    member_first_name = coalesce(ic.member_first_name, p.first_name),
    member_last_name = coalesce(ic.member_last_name, p.last_name),
    member_avatar_url = coalesce(ic.member_avatar_url, p.avatar_url)
  from public.profiles p
  where ic.used_by = p.id
    and p.id = p_user_id;

  update public.profiles
  set banned_at = now()
  where id = p_user_id;

  delete from auth.sessions
  where user_id = p_user_id;

  delete from auth.refresh_tokens
  where user_id = p_user_id::text;

  delete from auth.identities
  where user_id = p_user_id;

  delete from auth.users
  where id = p_user_id;

  return true;
end;
$$;

update public.invite_codes ic
set
  member_email = coalesce(ic.member_email, p.email),
  member_first_name = coalesce(ic.member_first_name, p.first_name),
  member_last_name = coalesce(ic.member_last_name, p.last_name),
  member_avatar_url = coalesce(ic.member_avatar_url, p.avatar_url),
  banned_at = coalesce(ic.banned_at, p.banned_at)
from public.profiles p
where ic.used_by = p.id;
