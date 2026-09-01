create table public.direct_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint direct_threads_pair check (user_a < user_b),
  constraint direct_threads_unique unique (user_a, user_b)
);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.direct_threads (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.direct_thread_reads (
  thread_id uuid not null references public.direct_threads (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, profile_id)
);

create index direct_threads_last_message_idx
  on public.direct_threads (last_message_at desc);
create index direct_messages_thread_idx
  on public.direct_messages (thread_id, created_at);
create index direct_threads_user_a_idx
  on public.direct_threads (user_a, last_message_at desc);
create index direct_threads_user_b_idx
  on public.direct_threads (user_b, last_message_at desc);

alter table public.direct_threads enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_thread_reads enable row level security;

revoke all on public.direct_threads from anon, authenticated;
revoke all on public.direct_messages from anon, authenticated;
revoke all on public.direct_thread_reads from anon, authenticated;

grant select on public.direct_threads to authenticated;
grant select on public.direct_messages to authenticated;
grant select on public.direct_thread_reads to authenticated;

drop policy if exists direct_threads_select_own on public.direct_threads;
create policy direct_threads_select_own
  on public.direct_threads for select to authenticated
  using (
    private.is_active_member()
    and (
      user_a = (select auth.uid())
      or user_b = (select auth.uid())
    )
  );

drop policy if exists direct_messages_select_own on public.direct_messages;
create policy direct_messages_select_own
  on public.direct_messages for select to authenticated
  using (
    private.is_active_member()
    and exists (
      select 1
      from public.direct_threads t
      where t.id = thread_id
        and (
          t.user_a = (select auth.uid())
          or t.user_b = (select auth.uid())
        )
    )
  );

drop policy if exists direct_reads_select_own on public.direct_thread_reads;
create policy direct_reads_select_own
  on public.direct_thread_reads for select to authenticated
  using (profile_id = (select auth.uid()) and private.is_active_member());

create or replace function private.direct_is_participant(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.direct_threads t
    where t.id = p_thread_id
      and (t.user_a = auth.uid() or t.user_b = auth.uid())
  );
$$;

create or replace function private.open_direct_thread(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  left_id uuid;
  right_id uuid;
  thread_id uuid;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_user_id is null or p_user_id = current_id then
    raise exception 'CANNOT_MESSAGE_SELF';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.banned_at is null
  ) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  left_id := least(current_id, p_user_id);
  right_id := greatest(current_id, p_user_id);

  insert into public.direct_threads (user_a, user_b)
  values (left_id, right_id)
  on conflict (user_a, user_b) do nothing;

  select t.id
    into thread_id
  from public.direct_threads t
  where t.user_a = left_id
    and t.user_b = right_id;

  return thread_id;
end;
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

  perform private.notify(
    other_id,
    'direct_message',
    jsonb_build_object(
      'href', '/beskeder/' || p_thread_id,
      'thread_id', p_thread_id,
      'body', left(cleaned, 140)
    )
  );

  return new_id;
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
end;
$$;

create or replace function private.list_direct_inbox()
returns table (
  thread_id uuid,
  other_id uuid,
  last_message_at timestamptz,
  last_body text,
  unread boolean
)
language plpgsql
stable
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

  return query
  select
    t.id,
    case when t.user_a = current_id then t.user_b else t.user_a end,
    t.last_message_at,
    (
      select m.body
      from public.direct_messages m
      where m.thread_id = t.id
      order by m.created_at desc
      limit 1
    ),
    exists (
      select 1
      from public.direct_messages m
      left join public.direct_thread_reads r
        on r.thread_id = t.id
       and r.profile_id = current_id
      where m.thread_id = t.id
        and m.author_id <> current_id
        and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
    )
  from public.direct_threads t
  where t.user_a = current_id
     or t.user_b = current_id
  order by t.last_message_at desc;
end;
$$;

create or replace function private.unread_direct_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  n integer;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    return 0;
  end if;

  select count(*)::integer
    into n
  from public.direct_threads t
  where (t.user_a = current_id or t.user_b = current_id)
    and exists (
      select 1
      from public.direct_messages m
      left join public.direct_thread_reads r
        on r.thread_id = t.id
       and r.profile_id = current_id
      where m.thread_id = t.id
        and m.author_id <> current_id
        and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
    );

  return coalesce(n, 0);
end;
$$;

create or replace function public.open_direct_thread(p_user_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.open_direct_thread(p_user_id);
$$;

create or replace function public.send_direct_message(
  p_thread_id uuid,
  p_body text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.send_direct_message(p_thread_id, p_body);
$$;

create or replace function public.mark_direct_thread_read(p_thread_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_direct_thread_read(p_thread_id);
$$;

create or replace function public.list_direct_inbox()
returns table (
  thread_id uuid,
  other_id uuid,
  last_message_at timestamptz,
  last_body text,
  unread boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.list_direct_inbox();
$$;

create or replace function public.unread_direct_count()
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.unread_direct_count();
$$;

grant execute on function private.direct_is_participant(uuid) to authenticated;
grant execute on function private.open_direct_thread(uuid) to authenticated;
grant execute on function private.send_direct_message(uuid, text) to authenticated;
grant execute on function private.mark_direct_thread_read(uuid) to authenticated;
grant execute on function private.list_direct_inbox() to authenticated;
grant execute on function private.unread_direct_count() to authenticated;
grant execute on function public.open_direct_thread(uuid) to authenticated;
grant execute on function public.send_direct_message(uuid, text) to authenticated;
grant execute on function public.mark_direct_thread_read(uuid) to authenticated;
grant execute on function public.list_direct_inbox() to authenticated;
grant execute on function public.unread_direct_count() to authenticated;
