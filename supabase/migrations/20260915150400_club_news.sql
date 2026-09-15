create table if not exists public.club_news (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  title text,
  body text not null,
  closed_at timestamptz
);

create table if not exists public.club_news_targets (
  news_id uuid not null references public.club_news (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (news_id, profile_id)
);

create index if not exists club_news_targets_profile_idx
  on public.club_news_targets (profile_id);

create table if not exists public.club_news_receipts (
  news_id uuid not null references public.club_news (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  shown_at timestamptz,
  acked_at timestamptz,
  primary key (news_id, profile_id)
);

create index if not exists club_news_receipts_unread_idx
  on public.club_news_receipts (profile_id)
  where acked_at is null;

alter table public.club_news enable row level security;
alter table public.club_news_targets enable row level security;
alter table public.club_news_receipts enable row level security;

revoke all on public.club_news from anon, authenticated;
revoke all on public.club_news_targets from anon, authenticated;
revoke all on public.club_news_receipts from anon, authenticated;

create or replace function private.club_news_person(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', coalesce(
      nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)), ''),
      nullif(p.username, ''),
      'Ukendt'
    )
  )
  from public.profiles p
  where p.id = p_id;
$$;

create or replace function private.create_club_news(
  p_title text,
  p_body text,
  p_profile_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  news_id uuid;
  cleaned_title text;
  cleaned_body text;
  n integer;
begin
  current_id := auth.uid();
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  cleaned_title := nullif(left(trim(coalesce(p_title, '')), 80), '');
  cleaned_body := left(trim(coalesce(p_body, '')), 800);
  if cleaned_body = '' then
    raise exception 'NEWS_BODY_REQUIRED';
  end if;

  if p_profile_ids is not null and coalesce(cardinality(p_profile_ids), 0) = 0 then
    raise exception 'NEWS_RECIPIENTS_REQUIRED';
  end if;

  insert into public.club_news (created_by, title, body)
  values (current_id, cleaned_title, cleaned_body)
  returning id into news_id;

  insert into public.club_news_targets (news_id, profile_id)
  select news_id, p.id
  from public.profiles p
  where p.banned_at is null
    and (p_profile_ids is null or p.id = any (p_profile_ids));

  get diagnostics n = row_count;
  if n = 0 then
    delete from public.club_news where id = news_id;
    raise exception 'NO_NEWS_RECIPIENTS';
  end if;

  return news_id;
end;
$$;

create or replace function private.pending_club_news()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  result jsonb;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    return null;
  end if;

  select jsonb_build_object(
    'id', n.id,
    'title', n.title,
    'body', n.body
  )
  into result
  from public.club_news n
  join public.club_news_targets t
    on t.news_id = n.id
   and t.profile_id = current_id
  left join public.club_news_receipts r
    on r.news_id = n.id
   and r.profile_id = current_id
  where n.closed_at is null
    and r.acked_at is null
  order by n.created_at
  limit 1;

  return result;
end;
$$;

create or replace function private.mark_club_news_shown(p_news_id uuid)
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
      and n.closed_at is null
  ) then
    raise exception 'NEWS_NOT_FOUND';
  end if;

  insert into public.club_news_receipts (news_id, profile_id, shown_at)
  values (p_news_id, current_id, now())
  on conflict (news_id, profile_id)
  do update set shown_at = coalesce(public.club_news_receipts.shown_at, excluded.shown_at);
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
end;
$$;

create or replace function private.close_club_news(p_news_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed timestamptz;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select closed_at into closed
  from public.club_news
  where id = p_news_id;

  if not found then
    raise exception 'NEWS_NOT_FOUND';
  end if;
  if closed is not null then
    raise exception 'NEWS_ALREADY_CLOSED';
  end if;

  update public.club_news
  set closed_at = now()
  where id = p_news_id;

  return true;
end;
$$;

create or replace function private.admin_club_news()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  return coalesce(
    (
      select jsonb_agg(row_data order by created_at desc)
      from (
        select
          n.created_at,
          jsonb_build_object(
            'id', n.id,
            'title', n.title,
            'body', n.body,
            'created_at', n.created_at,
            'closed_at', n.closed_at,
            'open', n.closed_at is null,
            'sent', (
              select count(*)::integer
              from public.club_news_targets t
              where t.news_id = n.id
            ),
            'shown', (
              select count(*)::integer
              from public.club_news_receipts r
              where r.news_id = n.id
                and r.shown_at is not null
            ),
            'acked', (
              select count(*)::integer
              from public.club_news_receipts r
              where r.news_id = n.id
                and r.acked_at is not null
            ),
            'acked_people', (
              select coalesce(
                jsonb_agg(private.club_news_person(r.profile_id) order by r.acked_at),
                '[]'::jsonb
              )
              from public.club_news_receipts r
              where r.news_id = n.id
                and r.acked_at is not null
            ),
            'shown_people', (
              select coalesce(
                jsonb_agg(private.club_news_person(r.profile_id) order by r.shown_at),
                '[]'::jsonb
              )
              from public.club_news_receipts r
              where r.news_id = n.id
                and r.shown_at is not null
                and r.acked_at is null
            ),
            'unseen_people', (
              select coalesce(
                jsonb_agg(
                  private.club_news_person(t.profile_id)
                  order by pr.first_name, pr.last_name, pr.username
                ),
                '[]'::jsonb
              )
              from public.club_news_targets t
              join public.profiles pr on pr.id = t.profile_id
              left join public.club_news_receipts r
                on r.news_id = t.news_id
               and r.profile_id = t.profile_id
              where t.news_id = n.id
                and r.shown_at is null
            )
          ) as row_data
        from public.club_news n
      ) listed
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.create_club_news(
  p_title text,
  p_body text,
  p_profile_ids uuid[] default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_club_news(p_title, p_body, p_profile_ids);
$$;

create or replace function public.pending_club_news()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.pending_club_news();
$$;

create or replace function public.mark_club_news_shown(p_news_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_club_news_shown(p_news_id);
$$;

create or replace function public.ack_club_news(p_news_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.ack_club_news(p_news_id);
$$;

create or replace function public.close_club_news(p_news_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.close_club_news(p_news_id);
$$;

create or replace function public.admin_club_news()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.admin_club_news();
$$;

revoke all on function private.club_news_person(uuid) from public, anon, authenticated;
revoke all on function private.create_club_news(text, text, uuid[]) from public, anon;
revoke all on function private.pending_club_news() from public, anon;
revoke all on function private.mark_club_news_shown(uuid) from public, anon;
revoke all on function private.ack_club_news(uuid) from public, anon;
revoke all on function private.close_club_news(uuid) from public, anon;
revoke all on function private.admin_club_news() from public, anon;
revoke all on function public.create_club_news(text, text, uuid[]) from public, anon;
revoke all on function public.pending_club_news() from public, anon;
revoke all on function public.mark_club_news_shown(uuid) from public, anon;
revoke all on function public.ack_club_news(uuid) from public, anon;
revoke all on function public.close_club_news(uuid) from public, anon;
revoke all on function public.admin_club_news() from public, anon;

grant execute on function private.create_club_news(text, text, uuid[]) to authenticated;
grant execute on function private.pending_club_news() to authenticated;
grant execute on function private.mark_club_news_shown(uuid) to authenticated;
grant execute on function private.ack_club_news(uuid) to authenticated;
grant execute on function private.close_club_news(uuid) to authenticated;
grant execute on function private.admin_club_news() to authenticated;
grant execute on function public.create_club_news(text, text, uuid[]) to authenticated;
grant execute on function public.pending_club_news() to authenticated;
grant execute on function public.mark_club_news_shown(uuid) to authenticated;
grant execute on function public.ack_club_news(uuid) to authenticated;
grant execute on function public.close_club_news(uuid) to authenticated;
grant execute on function public.admin_club_news() to authenticated;
