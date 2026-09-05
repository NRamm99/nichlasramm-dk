create or replace function private.close_poll(p_poll_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  poll_ends timestamptz;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select ends_at into poll_ends
  from public.polls
  where id = p_poll_id;

  if poll_ends is null then
    raise exception 'POLL_NOT_FOUND';
  end if;
  if poll_ends <= now() then
    raise exception 'POLL_ALREADY_CLOSED';
  end if;

  update public.polls
  set ends_at = now()
  where id = p_poll_id;

  return true;
end;
$$;

create or replace function public.close_poll(p_poll_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.close_poll(p_poll_id);
$$;

grant execute on function private.close_poll(uuid) to authenticated;
grant execute on function public.close_poll(uuid) to authenticated;
