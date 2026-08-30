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
