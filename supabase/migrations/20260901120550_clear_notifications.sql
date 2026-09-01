create or replace function private.clear_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  delete from public.notifications
  where recipient_id = auth.uid();
end;
$$;

create or replace function public.clear_notifications()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.clear_notifications();
$$;

revoke all on function private.clear_notifications() from public, anon;
revoke all on function public.clear_notifications() from public, anon;
grant execute on function private.clear_notifications() to authenticated;
grant execute on function public.clear_notifications() to authenticated;
