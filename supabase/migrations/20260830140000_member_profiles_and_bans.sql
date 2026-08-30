alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists avatar_url text,
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
    used_at = now()
  where code = invite
    and used_by is null
  returning id into claimed;

  if claimed is null then
    raise exception 'INVITE_INVALID';
  end if;

  return new;
end;
$$;

alter table public.invite_codes
  drop constraint if exists invite_codes_used_by_fkey;

alter table public.invite_codes
  add constraint invite_codes_used_by_fkey
  foreign key (used_by) references public.profiles (id) on delete set null;

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

  update public.profiles
  set banned_at = now()
  where id = p_user_id
    and banned_at is null;

  if not found then
    return false;
  end if;

  update auth.users
  set banned_until = 'infinity'
  where id = p_user_id;

  delete from auth.sessions
  where user_id = p_user_id;

  delete from auth.refresh_tokens
  where user_id = p_user_id::text;

  return true;
end;
$$;

create or replace function public.set_own_avatar(p_url text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.set_own_avatar(p_url);
end;
$$;

create or replace function public.ban_member(p_user_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.ban_member(p_user_id);
$$;

grant execute on function private.set_own_avatar(text) to authenticated;
grant execute on function private.ban_member(uuid) to authenticated;
grant execute on function public.set_own_avatar(text) to authenticated;
grant execute on function public.ban_member(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set
    public = true,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      or private.is_admin()
    )
  );
