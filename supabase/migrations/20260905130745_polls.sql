create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  question text not null,
  anonymous boolean not null default false,
  ends_at timestamptz not null
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  label text not null,
  sort integer not null
);

create unique index if not exists poll_options_poll_sort_key
  on public.poll_options (poll_id, sort);

create table if not exists public.poll_responses (
  poll_id uuid not null references public.polls (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  option_id uuid references public.poll_options (id) on delete cascade,
  declined boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (poll_id, profile_id),
  constraint poll_responses_choice_xor check (
    (declined and option_id is null)
    or (not declined and option_id is not null)
  )
);

create index if not exists poll_responses_option_idx
  on public.poll_responses (option_id)
  where option_id is not null;

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_responses enable row level security;

revoke all on table public.polls from anon, authenticated;
revoke all on table public.poll_options from anon, authenticated;
revoke all on table public.poll_responses from anon, authenticated;
grant select on table public.polls to authenticated;
grant select on table public.poll_options to authenticated;
grant select on table public.poll_responses to authenticated;

drop policy if exists polls_select_members on public.polls;
create policy polls_select_members
  on public.polls for select to authenticated
  using (
    private.is_active_member()
    and (ends_at > now() or private.is_admin())
  );

drop policy if exists poll_options_select_members on public.poll_options;
create policy poll_options_select_members
  on public.poll_options for select to authenticated
  using (
    exists (
      select 1
      from public.polls p
      where p.id = poll_id
        and private.is_active_member()
        and (p.ends_at > now() or private.is_admin())
    )
  );

drop policy if exists poll_responses_select_own on public.poll_responses;
create policy poll_responses_select_own
  on public.poll_responses for select to authenticated
  using (
    profile_id = (select auth.uid())
    and private.is_active_member()
  );

create or replace function private.create_poll(
  p_question text,
  p_anonymous boolean,
  p_ends_at timestamptz,
  p_options text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  poll_id uuid;
  cleaned text;
  option_label text;
  option_count integer := 0;
  seen text[] := '{}';
begin
  current_id := auth.uid();
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  cleaned := left(trim(coalesce(p_question, '')), 280);
  if cleaned = '' then
    raise exception 'POLL_QUESTION_REQUIRED';
  end if;

  if p_ends_at is null or p_ends_at <= now() then
    raise exception 'POLL_END_PAST';
  end if;

  if p_options is null then
    raise exception 'POLL_OPTIONS_REQUIRED';
  end if;

  insert into public.polls (created_by, question, anonymous, ends_at)
  values (current_id, cleaned, coalesce(p_anonymous, false), p_ends_at)
  returning id into poll_id;

  foreach option_label in array p_options
  loop
    option_label := left(trim(coalesce(option_label, '')), 80);
    if option_label = '' then
      continue;
    end if;
    if option_label = any (seen) then
      raise exception 'POLL_OPTION_DUPLICATE';
    end if;
    seen := seen || option_label;
    option_count := option_count + 1;
    insert into public.poll_options (poll_id, label, sort)
    values (poll_id, option_label, option_count);
  end loop;

  if option_count < 2 then
    raise exception 'POLL_OPTIONS_REQUIRED';
  end if;

  return poll_id;
end;
$$;

create or replace function private.respond_to_poll(
  p_poll_id uuid,
  p_option_id uuid,
  p_decline boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  poll_ends timestamptz;
  option_poll uuid;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select ends_at into poll_ends
  from public.polls
  where id = p_poll_id;

  if poll_ends is null then
    raise exception 'POLL_NOT_FOUND';
  end if;
  if poll_ends <= now() then
    raise exception 'POLL_CLOSED';
  end if;

  if coalesce(p_decline, false) then
    insert into public.poll_responses (poll_id, profile_id, option_id, declined)
    values (p_poll_id, current_id, null, true);
    return true;
  end if;

  if p_option_id is null then
    raise exception 'POLL_OPTION_REQUIRED';
  end if;

  select poll_id into option_poll
  from public.poll_options
  where id = p_option_id;

  if option_poll is distinct from p_poll_id then
    raise exception 'POLL_OPTION_INVALID';
  end if;

  insert into public.poll_responses (poll_id, profile_id, option_id, declined)
  values (p_poll_id, current_id, p_option_id, false);
  return true;
exception
  when unique_violation then
    raise exception 'POLL_ALREADY_ANSWERED';
end;
$$;

create or replace function private.pending_poll()
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
    'id', p.id,
    'question', p.question,
    'anonymous', p.anonymous,
    'ends_at', p.ends_at,
    'options', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('id', o.id, 'label', o.label)
          order by o.sort
        ),
        '[]'::jsonb
      )
      from public.poll_options o
      where o.poll_id = p.id
    )
  )
  into result
  from public.polls p
  where p.ends_at > now()
    and not exists (
      select 1
      from public.poll_responses r
      where r.poll_id = p.id
        and r.profile_id = current_id
    )
  order by p.ends_at
  limit 1;

  return result;
end;
$$;

create or replace function private.list_admin_polls()
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
          p.created_at,
          jsonb_build_object(
            'id', p.id,
            'question', p.question,
            'anonymous', p.anonymous,
            'ends_at', p.ends_at,
            'created_at', p.created_at,
            'open', p.ends_at > now(),
            'declined', (
              select count(*)::integer
              from public.poll_responses r
              where r.poll_id = p.id and r.declined
            ),
            'options', (
              select coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'id', o.id,
                    'label', o.label,
                    'votes', (
                      select count(*)::integer
                      from public.poll_responses r
                      where r.option_id = o.id
                    )
                  )
                  order by o.sort
                ),
                '[]'::jsonb
              )
              from public.poll_options o
              where o.poll_id = p.id
            ),
            'voters',
              case
                when p.anonymous then null
                else (
                  select coalesce(
                    jsonb_agg(
                      jsonb_build_object(
                        'id', pr.id,
                        'name', trim(both from concat_ws(
                          ' ',
                          pr.first_name,
                          pr.last_name
                        )),
                        'declined', r.declined,
                        'option_id', r.option_id
                      )
                      order by pr.first_name, pr.last_name
                    ),
                    '[]'::jsonb
                  )
                  from public.poll_responses r
                  join public.profiles pr on pr.id = r.profile_id
                  where r.poll_id = p.id
                )
              end
          ) as row_data
        from public.polls p
      ) listed
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.create_poll(
  p_question text,
  p_anonymous boolean,
  p_ends_at timestamptz,
  p_options text[]
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_poll(p_question, p_anonymous, p_ends_at, p_options);
$$;

create or replace function public.vote_poll(p_poll_id uuid, p_option_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.respond_to_poll(p_poll_id, p_option_id, false);
$$;

create or replace function public.decline_poll(p_poll_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.respond_to_poll(p_poll_id, null, true);
$$;

create or replace function public.pending_poll()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.pending_poll();
$$;

create or replace function public.list_admin_polls()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.list_admin_polls();
$$;

grant execute on function private.create_poll(text, boolean, timestamptz, text[]) to authenticated;
grant execute on function private.respond_to_poll(uuid, uuid, boolean) to authenticated;
grant execute on function private.pending_poll() to authenticated;
grant execute on function private.list_admin_polls() to authenticated;
grant execute on function public.create_poll(text, boolean, timestamptz, text[]) to authenticated;
grant execute on function public.vote_poll(uuid, uuid) to authenticated;
grant execute on function public.decline_poll(uuid) to authenticated;
grant execute on function public.pending_poll() to authenticated;
grant execute on function public.list_admin_polls() to authenticated;
