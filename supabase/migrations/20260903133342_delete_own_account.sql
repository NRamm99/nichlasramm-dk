alter table public.matches
  alter column created_by drop not null;

alter table public.matches
  drop constraint matches_created_by_fkey,
  add constraint matches_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.leagues
  alter column created_by drop not null;

alter table public.leagues
  drop constraint leagues_created_by_fkey,
  add constraint leagues_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.league_teams
  alter column created_by drop not null;

alter table public.league_teams
  drop constraint league_teams_created_by_fkey,
  add constraint league_teams_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;

create or replace function private.detach_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.match_players
  set
    guest_name = left(
      coalesce(nullif(trim(display_name), ''), 'Tidligere medlem'),
      80
    ),
    profile_id = null
  where profile_id = p_user_id;

  delete from public.league_team_players
  where profile_id = p_user_id;

  update public.matchmaker_listings
  set brought_partner_id = null
  where brought_partner_id = p_user_id;

  delete from storage.objects
  where bucket_id = 'avatars'
    and name like p_user_id::text || '/%';
end;
$$;

create or replace function private.delete_auth_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.sessions where user_id = p_user_id;
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.identities where user_id = p_user_id;
  delete from auth.users where id = p_user_id;
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

  perform private.detach_member(p_user_id);
  perform private.delete_auth_user(p_user_id);

  return true;
end;
$$;

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
    member_email = null
  from public.profiles p
  where ic.used_by = p.id
    and p.id = current_id;

  perform private.detach_member(current_id);
  perform private.delete_auth_user(current_id);
end;
$$;

create or replace function public.delete_own_account(p_confirm text, p_password text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_own_account(p_confirm, p_password);
$$;

revoke all on function private.detach_member(uuid) from public, anon, authenticated;
revoke all on function private.delete_auth_user(uuid) from public, anon, authenticated;
revoke all on function private.delete_own_account(text, text) from public, anon;
revoke all on function public.delete_own_account(text, text) from public, anon;

grant execute on function private.delete_own_account(text, text) to authenticated;
grant execute on function public.delete_own_account(text, text) to authenticated;
