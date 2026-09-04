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
end;
$$;

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
