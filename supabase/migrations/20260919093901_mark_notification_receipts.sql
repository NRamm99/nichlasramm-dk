create or replace function private.mark_own_notifications_read(
  p_kinds text[],
  p_payload_key text,
  p_payload_value text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null
    and kind = any (p_kinds)
    and (
      p_payload_key is null
      or p_payload_value is null
      or payload ->> p_payload_key = p_payload_value
    );
end;
$$;

create or replace function private.mark_matchmaker_listing_read(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not exists (select 1 from public.matchmaker_listings where id = p_listing_id) then
    raise exception 'LISTING_NOT_FOUND';
  end if;

  perform private.mark_own_notifications_read(
    array[
      'matchmaker_message',
      'matchmaker_rsvp',
      'matchmaker_listing',
      'matchmaker_closed',
      'matchmaker_removed',
      'matchmaker_converted'
    ],
    'listing_id',
    p_listing_id::text
  );

  if private.matchmaker_is_chat_member(p_listing_id) then
    insert into public.matchmaker_listing_reads (listing_id, profile_id, last_read_at)
    values (p_listing_id, auth.uid(), now())
    on conflict (listing_id, profile_id)
    do update set last_read_at = now();
  end if;
end;
$$;

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

  perform private.mark_own_notifications_read(
    array[
      'match_comment',
      'match_result_correction',
      'matchmaker_converted'
    ],
    'match_id',
    p_match_id::text
  );
end;
$$;

create or replace function private.mark_league_fixture_read(p_fixture_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (select 1 from public.league_fixtures where id = p_fixture_id) then
    raise exception 'FIXTURE_NOT_FOUND';
  end if;

  if not private.is_league_fixture_player(p_fixture_id) then
    raise exception 'NOT_FIXTURE_PLAYER';
  end if;

  insert into public.league_fixture_reads (fixture_id, profile_id, last_read_at)
  values (p_fixture_id, auth.uid(), now())
  on conflict (fixture_id, profile_id)
  do update set last_read_at = now();

  perform private.mark_own_notifications_read(
    array['league_message'],
    'fixture_id',
    p_fixture_id::text
  );
end;
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

  perform private.mark_own_notifications_read(
    array['direct_message'],
    'thread_id',
    p_thread_id::text
  );
end;
$$;

create or replace function private.ack_club_news(p_news_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1
    from public.club_news n
    join public.club_news_targets t
      on t.news_id = n.id
     and t.profile_id = current_id
    where n.id = p_news_id
  ) then
    raise exception 'NEWS_NOT_FOUND';
  end if;

  insert into public.club_news_receipts (news_id, profile_id, shown_at, acked_at)
  values (p_news_id, current_id, now(), now())
  on conflict (news_id, profile_id)
  do update set
    shown_at = coalesce(public.club_news_receipts.shown_at, excluded.shown_at),
    acked_at = coalesce(public.club_news_receipts.acked_at, excluded.acked_at);

  perform private.mark_own_notifications_read(
    array['club_news'],
    'news_id',
    p_news_id::text
  );
end;
$$;

create or replace function private.mark_partnership_requests_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  perform private.mark_own_notifications_read(
    array['partnership_request'],
    null,
    null
  );
end;
$$;

create or replace function private.mark_league_join_requests_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  perform private.mark_own_notifications_read(
    array['league_join_request'],
    null,
    null
  );
end;
$$;

create or replace function public.mark_partnership_requests_read()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_partnership_requests_read();
$$;

create or replace function public.mark_league_join_requests_read()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_league_join_requests_read();
$$;

revoke all on function private.mark_own_notifications_read(text[], text, text) from public, anon, authenticated;
revoke all on function private.mark_partnership_requests_read() from public, anon;
revoke all on function private.mark_league_join_requests_read() from public, anon;
revoke all on function public.mark_partnership_requests_read() from public, anon;
revoke all on function public.mark_league_join_requests_read() from public, anon;

grant execute on function private.mark_partnership_requests_read() to authenticated;
grant execute on function private.mark_league_join_requests_read() to authenticated;
grant execute on function public.mark_partnership_requests_read() to authenticated;
grant execute on function public.mark_league_join_requests_read() to authenticated;
