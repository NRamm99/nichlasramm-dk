update public.invite_codes
set archived_at = coalesce(archived_at, now())
where used_at is not null
  and used_by is null
  and banned_at is null;

create or replace function private.delete_own_account(p_confirm text, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  stored_hash text;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if trim(coalesce(p_confirm, '')) is distinct from 'SLET' then
    raise exception 'ACCOUNT_DELETE_CONFIRM';
  end if;

  if coalesce(p_password, '') = '' then
    raise exception 'INVALID_PASSWORD';
  end if;

  select u.encrypted_password
  into stored_hash
  from auth.users u
  where u.id = current_id;

  if stored_hash is null
    or stored_hash <> extensions.crypt(p_password, stored_hash)
  then
    raise exception 'INVALID_PASSWORD';
  end if;

  if exists (
    select 1
    from public.profiles
    where id = current_id
      and is_admin
  ) and not exists (
    select 1
    from public.profiles
    where is_admin
      and banned_at is null
      and id <> current_id
  ) then
    raise exception 'CANNOT_DELETE_LAST_ADMIN';
  end if;

  update public.invite_codes ic
  set
    member_username = coalesce(ic.member_username, p.username),
    member_first_name = coalesce(ic.member_first_name, p.first_name),
    member_last_name = coalesce(ic.member_last_name, p.last_name),
    member_avatar_url = coalesce(ic.member_avatar_url, p.avatar_url),
    member_email = null,
    archived_at = coalesce(ic.archived_at, now())
  from public.profiles p
  where ic.used_by = p.id
    and p.id = current_id;

  perform private.detach_member(current_id);
  perform private.delete_auth_user(current_id);
end;
$$;
