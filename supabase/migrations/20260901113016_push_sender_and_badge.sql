create or replace function private.profile_display_name(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)), ''),
    p.username,
    'Medlem'
  )
  from public.profiles p
  where p.id = p_id;
$$;

create or replace function private.send_direct_message(
  p_thread_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  cleaned text;
  new_id uuid;
  other_id uuid;
  sender_name text;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not private.direct_is_participant(p_thread_id) then
    raise exception 'THREAD_NOT_FOUND';
  end if;

  cleaned := left(trim(coalesce(p_body, '')), 1000);
  if cleaned = '' then
    raise exception 'MESSAGE_REQUIRED';
  end if;

  insert into public.direct_messages (thread_id, author_id, body)
  values (p_thread_id, current_id, cleaned)
  returning id into new_id;

  update public.direct_threads
  set last_message_at = now()
  where id = p_thread_id;

  insert into public.direct_thread_reads (thread_id, profile_id, last_read_at)
  values (p_thread_id, current_id, now())
  on conflict (thread_id, profile_id)
  do update set last_read_at = excluded.last_read_at;

  select case
    when t.user_a = current_id then t.user_b
    else t.user_a
  end
    into other_id
  from public.direct_threads t
  where t.id = p_thread_id;

  sender_name := private.profile_display_name(current_id);

  perform private.notify(
    other_id,
    'direct_message',
    jsonb_build_object(
      'href', '/beskeder/' || p_thread_id,
      'thread_id', p_thread_id,
      'body', left(cleaned, 140),
      'from', sender_name
    )
  );

  return new_id;
end;
$$;

create or replace function private.unread_badge_count(p_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.notifications
  where recipient_id = p_profile_id
    and read_at is null;
$$;

create or replace function public.unread_badge_count()
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.unread_badge_count(auth.uid());
$$;

create or replace function public.unread_badge_count_for(p_profile_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.unread_badge_count(p_profile_id);
$$;

create or replace function private.mark_direct_thread_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not private.direct_is_participant(p_thread_id) then
    raise exception 'THREAD_NOT_FOUND';
  end if;

  insert into public.direct_thread_reads (thread_id, profile_id, last_read_at)
  values (p_thread_id, auth.uid(), now())
  on conflict (thread_id, profile_id)
  do update set last_read_at = excluded.last_read_at;

  update public.notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null
    and kind = 'direct_message'
    and payload->>'thread_id' = p_thread_id::text;
end;
$$;

revoke all on function public.unread_badge_count_for(uuid) from public, anon, authenticated;
revoke all on function public.unread_badge_count() from public, anon;
revoke all on function private.profile_display_name(uuid) from public, anon, authenticated;
revoke all on function private.unread_badge_count(uuid) from public, anon, authenticated;
grant execute on function public.unread_badge_count() to authenticated;
grant execute on function public.unread_badge_count_for(uuid) to service_role;
