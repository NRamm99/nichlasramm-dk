create table if not exists private.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create unique index if not exists password_reset_codes_unused_code_key
  on private.password_reset_codes (code)
  where used_at is null;

revoke all on table private.password_reset_codes from anon, authenticated;

create or replace function private.create_password_reset_code(p_user_id uuid)
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

  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
      and banned_at is null
  ) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  delete from private.password_reset_codes
  where user_id = p_user_id
    and used_at is null;

  loop
    new_code :=
      'PWD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    begin
      insert into private.password_reset_codes (code, user_id, created_by)
      values (new_code, p_user_id, auth.uid());
      return new_code;
    exception
      when unique_violation then
        null;
    end;
  end loop;
end;
$$;

create or replace function private.complete_password_reset(
  p_username text,
  p_code text,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  reset_id uuid;
  target_id uuid;
  lookup_username text;
  lookup_code text;
begin
  lookup_username := lower(trim(coalesce(p_username, '')));
  lookup_code := upper(trim(coalesce(p_code, '')));
  lookup_code := regexp_replace(lookup_code, '\s+', '', 'g');

  if lookup_username = '' or lookup_code = '' then
    raise exception 'RESET_INVALID';
  end if;

  if length(coalesce(p_password, '')) < 6 then
    raise exception 'PASSWORD_TOO_SHORT';
  end if;

  select prc.id, prc.user_id
  into reset_id, target_id
  from private.password_reset_codes prc
  join public.profiles p on p.id = prc.user_id
  where prc.code = lookup_code
    and prc.used_at is null
    and prc.created_at > now() - interval '24 hours'
    and p.username = lookup_username
    and p.banned_at is null;

  if reset_id is null then
    raise exception 'RESET_INVALID';
  end if;

  update auth.users
  set
    encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    updated_at = now()
  where id = target_id;

  update private.password_reset_codes
  set used_at = now()
  where id = reset_id;

  delete from auth.sessions
  where user_id = target_id;

  delete from auth.refresh_tokens
  where user_id = target_id::text;

  return true;
end;
$$;

create or replace function public.create_password_reset_code(p_user_id uuid)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.create_password_reset_code(p_user_id);
$$;

create or replace function public.complete_password_reset(
  p_username text,
  p_code text,
  p_password text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.complete_password_reset(p_username, p_code, p_password);
$$;

grant execute on function private.create_password_reset_code(uuid) to authenticated;
grant execute on function private.complete_password_reset(text, text, text) to anon, authenticated;
grant execute on function public.create_password_reset_code(uuid) to authenticated;
grant execute on function public.complete_password_reset(text, text, text) to anon, authenticated;
