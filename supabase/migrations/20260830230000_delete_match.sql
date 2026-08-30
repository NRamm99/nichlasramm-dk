create or replace function private.delete_match(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (select 1 from public.matches where id = p_match_id) then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if not private.is_admin() and not private.is_match_participant(p_match_id) then
    raise exception 'CANNOT_DELETE_MATCH';
  end if;

  delete from public.matches
  where id = p_match_id;

  return true;
end;
$$;

create or replace function public.delete_match(p_match_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.delete_match(p_match_id);
$$;

grant execute on function private.delete_match(uuid) to authenticated;
grant execute on function public.delete_match(uuid) to authenticated;
