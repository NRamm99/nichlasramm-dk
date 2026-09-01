create or replace function public.unread_badge_count()
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.unread_badge_count(auth.uid());
$$;

revoke all on function public.unread_badge_count_for(uuid) from public, anon, authenticated;
revoke all on function public.unread_badge_count() from public, anon;
revoke all on function private.profile_display_name(uuid) from public, anon, authenticated;
revoke all on function private.unread_badge_count(uuid) from public, anon, authenticated;
grant execute on function public.unread_badge_count() to authenticated;
grant execute on function public.unread_badge_count_for(uuid) to service_role;
