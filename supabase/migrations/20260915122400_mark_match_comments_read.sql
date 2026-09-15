create or replace function private.mark_match_comments_read(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not exists (select 1 from public.matches where id = p_match_id) then
    raise exception 'MATCH_NOT_FOUND';
  end if;
  if not private.is_match_participant(p_match_id) then
    raise exception 'NOT_MATCH_PLAYER';
  end if;

  update public.notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null
    and kind = 'match_comment'
    and payload->>'match_id' = p_match_id::text;
end;
$$;

create or replace function public.mark_match_comments_read(p_match_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_match_comments_read(p_match_id);
$$;

revoke all on function private.mark_match_comments_read(uuid) from public, anon;
revoke all on function public.mark_match_comments_read(uuid) from public, anon;
grant execute on function private.mark_match_comments_read(uuid) to authenticated;
grant execute on function public.mark_match_comments_read(uuid) to authenticated;

create or replace function private.add_match_comment(p_match_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  new_id uuid;
  cleaned text;
  recipient uuid;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (select 1 from public.matches where id = p_match_id) then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if not private.is_match_participant(p_match_id) then
    raise exception 'NOT_MATCH_PLAYER';
  end if;

  cleaned := left(trim(coalesce(p_body, '')), 1000);
  if cleaned = '' then
    raise exception 'COMMENT_REQUIRED';
  end if;

  insert into public.match_comments (match_id, author_id, body)
  values (p_match_id, current_id, cleaned)
  returning id into new_id;

  for recipient in
    select distinct profile_id
    from public.match_players
    where match_id = p_match_id
      and profile_id is not null
      and profile_id <> current_id
  loop
    perform private.notify(
      recipient,
      'match_comment',
      jsonb_build_object('match_id', p_match_id, 'href', '/kampe/' || p_match_id)
    );
  end loop;

  return new_id;
end;
$$;
