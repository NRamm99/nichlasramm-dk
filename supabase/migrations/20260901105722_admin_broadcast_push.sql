create or replace function private.send_admin_push(
  p_body text,
  p_profile_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text;
  n integer;
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  cleaned := left(trim(coalesce(p_body, '')), 280);
  if cleaned = '' then
    raise exception 'PUSH_BODY_REQUIRED';
  end if;

  if p_profile_ids is not null and coalesce(cardinality(p_profile_ids), 0) = 0 then
    raise exception 'PUSH_RECIPIENTS_REQUIRED';
  end if;

  insert into public.notifications (recipient_id, kind, payload)
  select
    p.id,
    'admin_broadcast',
    jsonb_build_object('href', '/nyt', 'body', cleaned)
  from public.profiles p
  where p.banned_at is null
    and (p_profile_ids is null or p.id = any (p_profile_ids));

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'NO_PUSH_RECIPIENTS';
  end if;

  return n;
end;
$$;

create or replace function public.send_admin_push(
  p_body text,
  p_profile_ids uuid[] default null
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.send_admin_push(p_body, p_profile_ids);
$$;

grant execute on function private.send_admin_push(text, uuid[]) to authenticated;
grant execute on function public.send_admin_push(text, uuid[]) to authenticated;
