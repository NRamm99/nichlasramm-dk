alter table public.polls
  add column if not exists archived_at timestamptz;

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
    and p.archived_at is null
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
            'archived_at', p.archived_at,
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

create or replace function private.archive_poll(p_poll_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  poll_ends timestamptz;
  poll_archived timestamptz;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select ends_at, archived_at into poll_ends, poll_archived
  from public.polls
  where id = p_poll_id;

  if poll_ends is null then
    raise exception 'POLL_NOT_FOUND';
  end if;
  if poll_ends > now() then
    raise exception 'POLL_STILL_OPEN';
  end if;
  if poll_archived is not null then
    raise exception 'POLL_ALREADY_ARCHIVED';
  end if;

  update public.polls
  set archived_at = now()
  where id = p_poll_id;

  return true;
end;
$$;

create or replace function private.unarchive_poll(p_poll_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  poll_archived timestamptz;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select archived_at into poll_archived
  from public.polls
  where id = p_poll_id;

  if not found then
    raise exception 'POLL_NOT_FOUND';
  end if;
  if poll_archived is null then
    raise exception 'POLL_NOT_ARCHIVED';
  end if;

  update public.polls
  set archived_at = null
  where id = p_poll_id;

  return true;
end;
$$;

create or replace function private.delete_poll(p_poll_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  poll_ends timestamptz;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select ends_at into poll_ends
  from public.polls
  where id = p_poll_id;

  if poll_ends is null then
    raise exception 'POLL_NOT_FOUND';
  end if;
  if poll_ends > now() then
    raise exception 'POLL_STILL_OPEN';
  end if;

  delete from public.polls
  where id = p_poll_id;

  return true;
end;
$$;

create or replace function public.archive_poll(p_poll_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.archive_poll(p_poll_id);
$$;

create or replace function public.unarchive_poll(p_poll_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.unarchive_poll(p_poll_id);
$$;

create or replace function public.delete_poll(p_poll_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.delete_poll(p_poll_id);
$$;

grant execute on function private.archive_poll(uuid) to authenticated;
grant execute on function private.unarchive_poll(uuid) to authenticated;
grant execute on function private.delete_poll(uuid) to authenticated;
grant execute on function public.archive_poll(uuid) to authenticated;
grant execute on function public.unarchive_poll(uuid) to authenticated;
grant execute on function public.delete_poll(uuid) to authenticated;
