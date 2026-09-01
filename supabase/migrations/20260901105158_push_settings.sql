create table private.push_settings (
  id smallint primary key default 1 check (id = 1),
  dispatch_secret text not null,
  vapid_public text not null,
  vapid_private text not null,
  vapid_subject text not null
);

revoke all on private.push_settings from public, anon, authenticated;

create or replace function private.read_push_settings()
returns table (
  dispatch_secret text,
  vapid_public text,
  vapid_private text,
  vapid_subject text
)
language sql
security definer
set search_path = ''
as $$
  select s.dispatch_secret, s.vapid_public, s.vapid_private, s.vapid_subject
  from private.push_settings s
  where s.id = 1;
$$;

create or replace function public.read_push_settings()
returns table (
  dispatch_secret text,
  vapid_public text,
  vapid_private text,
  vapid_subject text
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.read_push_settings();
$$;

revoke all on function private.read_push_settings() from public, anon, authenticated;
revoke all on function public.read_push_settings() from public, anon, authenticated;
grant execute on function private.read_push_settings() to service_role;
grant execute on function public.read_push_settings() to service_role;
