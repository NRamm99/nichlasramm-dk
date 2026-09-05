alter table public.polls
  add column if not exists comment_mode text not null default 'off',
  add column if not exists comment_title text;

alter table public.polls
  drop constraint if exists polls_comment_mode_check;
alter table public.polls
  add constraint polls_comment_mode_check
  check (comment_mode in ('off', 'optional', 'only'));

alter table public.poll_responses
  add column if not exists comment text;

alter table public.poll_responses
  drop constraint if exists poll_responses_choice_xor;
alter table public.poll_responses
  add constraint poll_responses_choice_xor check (
    (declined and option_id is null)
    or (not declined)
  );

drop function if exists public.vote_poll(uuid, uuid);
drop function if exists public.decline_poll(uuid);
drop function if exists public.create_poll(text, boolean, timestamptz, text[]);
drop function if exists private.create_poll(text, boolean, timestamptz, text[]);
drop function if exists private.respond_to_poll(uuid, uuid, boolean);

create or replace function private.create_poll(
  p_question text,
  p_anonymous boolean,
  p_ends_at timestamptz,
  p_options text[],
  p_comment_mode text default 'off',
  p_comment_title text default null
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
  mode text;
  title text;
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

  mode := coalesce(nullif(trim(p_comment_mode), ''), 'off');
  if mode not in ('off', 'optional', 'only') then
    raise exception 'POLL_COMMENT_MODE_INVALID';
  end if;

  title := left(trim(coalesce(p_comment_title, '')), 80);
  if mode <> 'off' and title = '' then
    raise exception 'POLL_COMMENT_TITLE_REQUIRED';
  end if;
  if mode = 'off' then
    title := null;
  end if;

  insert into public.polls (
    created_by, question, anonymous, ends_at, comment_mode, comment_title
  )
  values (
    current_id, cleaned, coalesce(p_anonymous, false), p_ends_at, mode, title
  )
  returning id into poll_id;

  if mode <> 'only' then
    if p_options is null then
      raise exception 'POLL_OPTIONS_REQUIRED';
    end if;
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
  end if;

  return poll_id;
end;
$$;

create or replace function private.respond_to_poll(
  p_poll_id uuid,
  p_option_id uuid,
  p_comment text,
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
  poll_mode text;
  option_poll uuid;
  cleaned text;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select ends_at, comment_mode into poll_ends, poll_mode
  from public.polls
  where id = p_poll_id;

  if poll_ends is null then
    raise exception 'POLL_NOT_FOUND';
  end if;
  if poll_ends <= now() then
    raise exception 'POLL_CLOSED';
  end if;

  cleaned := left(trim(coalesce(p_comment, '')), 500);
  if cleaned = '' then
    cleaned := null;
  end if;

  if coalesce(p_decline, false) then
    insert into public.poll_responses (
      poll_id, profile_id, option_id, declined, comment
    )
    values (p_poll_id, current_id, null, true, null);
    return true;
  end if;

  if poll_mode = 'only' then
    if cleaned is null then
      raise exception 'POLL_COMMENT_REQUIRED';
    end if;
    insert into public.poll_responses (
      poll_id, profile_id, option_id, declined, comment
    )
    values (p_poll_id, current_id, null, false, cleaned);
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

  if poll_mode = 'off' then
    cleaned := null;
  end if;

  insert into public.poll_responses (
    poll_id, profile_id, option_id, declined, comment
  )
  values (p_poll_id, current_id, p_option_id, false, cleaned);
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
    'comment_mode', p.comment_mode,
    'comment_title', p.comment_title,
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
            'comment_mode', p.comment_mode,
            'comment_title', p.comment_title,
            'open', p.ends_at > now(),
            'declined', (
              select count(*)::integer
              from public.poll_responses r
              where r.poll_id = p.id and r.declined
            ),
            'answered', (
              select count(*)::integer
              from public.poll_responses r
              where r.poll_id = p.id and not r.declined
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
            'comments', (
              select coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'name',
                      case
                        when p.anonymous then null
                        else nullif(trim(both from concat_ws(
                          ' ',
                          pr.first_name,
                          pr.last_name
                        )), '')
                      end,
                    'text', r.comment
                  )
                  order by r.created_at
                ),
                '[]'::jsonb
              )
              from public.poll_responses r
              join public.profiles pr on pr.id = r.profile_id
              where r.poll_id = p.id
                and r.comment is not null
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
                        'option_id', r.option_id,
                        'comment', r.comment
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
  p_options text[],
  p_comment_mode text default 'off',
  p_comment_title text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_poll(
    p_question, p_anonymous, p_ends_at, p_options, p_comment_mode, p_comment_title
  );
$$;

create or replace function public.vote_poll(
  p_poll_id uuid,
  p_option_id uuid,
  p_comment text default null
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.respond_to_poll(p_poll_id, p_option_id, p_comment, false);
$$;

create or replace function public.decline_poll(p_poll_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.respond_to_poll(p_poll_id, null, null, true);
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

grant execute on function private.create_poll(text, boolean, timestamptz, text[], text, text) to authenticated;
grant execute on function private.respond_to_poll(uuid, uuid, text, boolean) to authenticated;
grant execute on function private.pending_poll() to authenticated;
grant execute on function private.list_admin_polls() to authenticated;
grant execute on function public.create_poll(text, boolean, timestamptz, text[], text, text) to authenticated;
grant execute on function public.vote_poll(uuid, uuid, text) to authenticated;
grant execute on function public.decline_poll(uuid) to authenticated;
grant execute on function public.pending_poll() to authenticated;
grant execute on function public.list_admin_polls() to authenticated;
