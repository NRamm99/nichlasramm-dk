create or replace function private.dispatch_web_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_secret text;
begin
  select ds.decrypted_secret
    into dispatch_secret
  from vault.decrypted_secrets ds
  where ds.name = 'push_dispatch_secret'
  limit 1;

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
    timeout_milliseconds := 3000
  );
  return NEW;
exception
  when others then
    return NEW;
end;
$$;
