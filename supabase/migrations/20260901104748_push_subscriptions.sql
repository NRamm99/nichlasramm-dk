create extension if not exists pg_net;

create table public.push_subscriptions (
  endpoint text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions for select to authenticated
  using (profile_id = (select auth.uid()) and private.is_active_member());

create or replace function private.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
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
  if p_endpoint is null or left(p_endpoint, 8) <> 'https://' then
    raise exception 'PUSH_SUBSCRIBE_FAILED';
  end if;
  if coalesce(trim(p_p256dh), '') = '' or coalesce(trim(p_auth), '') = '' then
    raise exception 'PUSH_SUBSCRIBE_FAILED';
  end if;

  insert into public.push_subscriptions (endpoint, profile_id, p256dh, auth)
  values (left(p_endpoint, 2048), current_id, left(p_p256dh, 256), left(p_auth, 256))
  on conflict (endpoint)
  do update set
    profile_id = excluded.profile_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    updated_at = now();
end;
$$;

create or replace function private.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  delete from public.push_subscriptions
  where endpoint = p_endpoint
    and profile_id = auth.uid();
end;
$$;

create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.save_push_subscription(p_endpoint, p_p256dh, p_auth);
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_push_subscription(p_endpoint);
$$;

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

drop trigger if exists notifications_dispatch_web_push on public.notifications;
create trigger notifications_dispatch_web_push
  after insert on public.notifications
  for each row
  execute function private.dispatch_web_push();

grant execute on function private.save_push_subscription(text, text, text) to authenticated;
grant execute on function private.delete_push_subscription(text) to authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
