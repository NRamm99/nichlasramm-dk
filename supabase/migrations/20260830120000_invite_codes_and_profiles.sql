create schema if not exists private;

grant usage on schema private to anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);

create unique index if not exists invite_codes_code_key
  on public.invite_codes (code);

create unique index if not exists invite_codes_used_by_key
  on public.invite_codes (used_by)
  where used_by is not null;

alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.invite_codes from anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.invite_codes to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_admin
  );
$$;

create or replace function private.invite_code_available(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.invite_codes
    where code = upper(trim(p_code))
      and used_by is null
  );
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite text;
  claimed uuid;
begin
  invite := upper(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  invite := regexp_replace(invite, '\s+', '', 'g');

  if invite = '' then
    raise exception 'INVITE_REQUIRED';
  end if;

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

  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, false);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();

create or replace function private.create_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_code text;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  loop
    new_code :=
      'PBR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    begin
      insert into public.invite_codes (code, created_by)
      values (new_code, auth.uid());
      return new_code;
    exception
      when unique_violation then
        null;
    end;
  end loop;
end;
$$;

create or replace function private.revoke_invite_code(p_id uuid)
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

  delete from public.invite_codes
  where id = p_id
    and used_by is null;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

create or replace function private.bootstrap_admin()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if exists (select 1 from public.profiles where is_admin) then
    return false;
  end if;

  insert into public.profiles (id, email, is_admin)
  values (
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    true
  )
  on conflict (id) do update
    set is_admin = true;

  return true;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_admin();
$$;

create or replace function public.invite_code_available(p_code text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.invite_code_available(p_code);
$$;

create or replace function public.create_invite_code()
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.create_invite_code();
$$;

create or replace function public.revoke_invite_code(p_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.revoke_invite_code(p_id);
$$;

create or replace function public.bootstrap_admin()
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.bootstrap_admin();
$$;

grant execute on function private.is_admin() to authenticated;
grant execute on function private.invite_code_available(text) to anon, authenticated;
grant execute on function private.create_invite_code() to authenticated;
grant execute on function private.revoke_invite_code(uuid) to authenticated;
grant execute on function private.bootstrap_admin() to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.invite_code_available(text) to anon, authenticated;
grant execute on function public.create_invite_code() to authenticated;
grant execute on function public.revoke_invite_code(uuid) to authenticated;
grant execute on function public.bootstrap_admin() to authenticated;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or private.is_admin());

drop policy if exists invite_codes_admin_select on public.invite_codes;
create policy invite_codes_admin_select
  on public.invite_codes
  for select
  to authenticated
  using (private.is_admin());

insert into public.profiles (id, email, is_admin)
select
  id,
  email,
  email = 'ramm.nichlas@gmail.com'
from auth.users
on conflict (id) do update
  set
    email = excluded.email,
    is_admin = public.profiles.is_admin or excluded.is_admin;
