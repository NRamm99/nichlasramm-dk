create or replace function public.read_push_settings()
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

revoke all on function public.read_push_settings() from public, anon, authenticated;
grant execute on function public.read_push_settings() to service_role;

create or replace function private.dispatch_web_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_secret text;
begin
  select s.dispatch_secret
    into dispatch_secret
  from private.push_settings s
  where s.id = 1;

  if dispatch_secret is null then
    select ds.decrypted_secret
      into dispatch_secret
    from vault.decrypted_secrets ds
    where ds.name = 'push_dispatch_secret'
    limit 1;
  end if;

  if dispatch_secret is null then
    return NEW;
  end if;

  perform net.http_post(
    url := 'https://yaaeeusdcxfebulwsvur.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || dispatch_secret
    ),
    body := jsonb_build_object(
      'recipient_id', NEW.recipient_id,
      'kind', NEW.kind,
      'payload', coalesce(NEW.payload, '{}'::jsonb)
    ),
    timeout_milliseconds := 8000
  );
  return NEW;
exception
  when others then
    return NEW;
end;
$$;
