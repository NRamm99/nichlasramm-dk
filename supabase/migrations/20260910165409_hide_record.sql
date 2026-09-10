alter table public.profiles
  add column if not exists hide_record boolean not null default false;

create or replace function private.set_hide_record(p_hide boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
begin
  current_id := private.require_self();

  update public.profiles
  set hide_record = coalesce(p_hide, false)
  where id = current_id;
end;
$$;

create or replace function public.set_hide_record(p_hide boolean)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_hide_record(p_hide);
$$;

grant execute on function private.set_hide_record(boolean) to authenticated;
grant execute on function public.set_hide_record(boolean) to authenticated;
