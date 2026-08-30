create or replace function private.auto_confirm_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_auto_confirm on auth.users;

create trigger on_auth_user_auto_confirm
  before insert on auth.users
  for each row
  execute function private.auto_confirm_email();
