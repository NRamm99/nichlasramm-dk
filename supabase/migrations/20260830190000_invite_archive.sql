alter table public.invite_codes
  add column if not exists archived_at timestamptz;

create or replace function private.archive_invite(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  update public.invite_codes
  set archived_at = now()
  where id = p_id
    and used_at is not null
    and archived_at is null;

  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$$;

create or replace function private.unarchive_invite(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  update public.invite_codes
  set archived_at = null
  where id = p_id
    and archived_at is not null;

  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$$;

create or replace function public.archive_invite(p_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.archive_invite(p_id);
$$;

create or replace function public.unarchive_invite(p_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.unarchive_invite(p_id);
$$;

grant execute on function private.archive_invite(uuid) to authenticated;
grant execute on function private.unarchive_invite(uuid) to authenticated;
grant execute on function public.archive_invite(uuid) to authenticated;
grant execute on function public.unarchive_invite(uuid) to authenticated;
