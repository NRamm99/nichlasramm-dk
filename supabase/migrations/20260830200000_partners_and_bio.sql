alter table public.profiles
  add column if not exists bio text,
  add column if not exists partner_id uuid;

alter table public.profiles
  drop constraint if exists profiles_partner_id_fkey;

alter table public.profiles
  add constraint profiles_partner_id_fkey
  foreign key (partner_id) references public.profiles (id) on delete set null;

alter table public.profiles
  drop constraint if exists profiles_partner_not_self;

alter table public.profiles
  add constraint profiles_partner_not_self
  check (partner_id is distinct from id);

create unique index if not exists profiles_partner_id_key
  on public.profiles (partner_id)
  where partner_id is not null;

create table if not exists public.partnership_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint partnership_requests_not_self check (requester_id <> recipient_id)
);

create unique index if not exists partnership_requests_pair_key
  on public.partnership_requests (
    least(requester_id, recipient_id),
    greatest(requester_id, recipient_id)
  );

create index if not exists partnership_requests_recipient_idx
  on public.partnership_requests (recipient_id);

alter table public.partnership_requests enable row level security;

revoke all on public.partnership_requests from anon, authenticated;
grant select on public.partnership_requests to authenticated;

drop policy if exists partnership_requests_select_involved on public.partnership_requests;
create policy partnership_requests_select_involved
  on public.partnership_requests
  for select
  to authenticated
  using (
    requester_id = (select auth.uid())
    or recipient_id = (select auth.uid())
  );

drop policy if exists profiles_select_active_members on public.profiles;
create policy profiles_select_active_members
  on public.profiles
  for select
  to authenticated
  using (banned_at is null);

create or replace function private.require_self()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_id uuid;
begin
  current_id := auth.uid();
  if current_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  return current_id;
end;
$$;

create or replace function private.lock_profile_pair(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_a < p_b then
    perform 1 from public.profiles where id = p_a for update;
    perform 1 from public.profiles where id = p_b for update;
  else
    perform 1 from public.profiles where id = p_b for update;
    perform 1 from public.profiles where id = p_a for update;
  end if;
end;
$$;

create or replace function private.form_partnership(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a_partner uuid;
  b_partner uuid;
begin
  if p_a = p_b then
    raise exception 'CANNOT_PARTNER_SELF';
  end if;

  perform private.lock_profile_pair(p_a, p_b);

  select partner_id into a_partner from public.profiles where id = p_a;
  select partner_id into b_partner from public.profiles where id = p_b;

  if a_partner is not null then
    raise exception 'HAS_PARTNER';
  end if;

  if b_partner is not null then
    raise exception 'TARGET_HAS_PARTNER';
  end if;

  update public.profiles set partner_id = p_b where id = p_a;
  update public.profiles set partner_id = p_a where id = p_b;

  delete from public.partnership_requests
  where requester_id in (p_a, p_b)
     or recipient_id in (p_a, p_b);
end;
$$;

create or replace function private.update_own_profile(
  p_first_name text,
  p_last_name text,
  p_bio text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  new_first text;
  new_last text;
  new_bio text;
begin
  current_id := private.require_self();
  new_first := left(trim(coalesce(p_first_name, '')), 80);
  new_last := left(trim(coalesce(p_last_name, '')), 80);
  new_bio := left(trim(coalesce(p_bio, '')), 500);

  if new_first = '' or new_last = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  update public.profiles
  set
    first_name = new_first,
    last_name = new_last,
    bio = nullif(new_bio, '')
  where id = current_id;
end;
$$;

create or replace function private.request_partnership(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  existing_id uuid;
  reverse_id uuid;
begin
  current_id := private.require_self();

  if p_user_id is null or p_user_id = current_id then
    raise exception 'CANNOT_PARTNER_SELF';
  end if;

  perform private.lock_profile_pair(current_id, p_user_id);

  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
      and banned_at is null
  ) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.profiles where id = current_id and partner_id is not null
  ) then
    raise exception 'HAS_PARTNER';
  end if;

  if exists (
    select 1 from public.profiles where id = p_user_id and partner_id is not null
  ) then
    raise exception 'TARGET_HAS_PARTNER';
  end if;

  select id
  into reverse_id
  from public.partnership_requests
  where requester_id = p_user_id
    and recipient_id = current_id;

  if reverse_id is not null then
    perform private.form_partnership(current_id, p_user_id);
    return reverse_id;
  end if;

  begin
    insert into public.partnership_requests (requester_id, recipient_id)
    values (current_id, p_user_id)
    returning id into existing_id;
  exception
    when unique_violation then
      raise exception 'ALREADY_REQUESTED';
  end;

  return existing_id;
end;
$$;

create or replace function private.accept_partnership(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  from_id uuid;
  to_id uuid;
begin
  current_id := private.require_self();

  select requester_id, recipient_id
  into from_id, to_id
  from public.partnership_requests
  where id = p_request_id;

  if from_id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if to_id <> current_id then
    raise exception 'NOT_RECIPIENT';
  end if;

  perform private.form_partnership(from_id, to_id);
  return true;
end;
$$;

create or replace function private.decline_partnership(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  deleted_count integer;
begin
  current_id := private.require_self();

  delete from public.partnership_requests
  where id = p_request_id
    and recipient_id = current_id;

  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  return true;
end;
$$;

create or replace function private.cancel_partnership_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  deleted_count integer;
begin
  current_id := private.require_self();

  delete from public.partnership_requests
  where id = p_request_id
    and requester_id = current_id;

  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  return true;
end;
$$;

create or replace function private.remove_partner()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  other_id uuid;
begin
  current_id := private.require_self();

  select partner_id into other_id
  from public.profiles
  where id = current_id;

  if other_id is null then
    return false;
  end if;

  perform private.lock_profile_pair(current_id, other_id);

  select partner_id into other_id
  from public.profiles
  where id = current_id;

  if other_id is null then
    return false;
  end if;

  update public.profiles
  set partner_id = null
  where id in (current_id, other_id);

  return true;
end;
$$;

create or replace function public.update_own_profile(
  p_first_name text,
  p_last_name text,
  p_bio text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.update_own_profile(p_first_name, p_last_name, p_bio);
$$;

create or replace function public.request_partnership(p_user_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.request_partnership(p_user_id);
$$;

create or replace function public.accept_partnership(p_request_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.accept_partnership(p_request_id);
$$;

create or replace function public.decline_partnership(p_request_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.decline_partnership(p_request_id);
$$;

create or replace function public.cancel_partnership_request(p_request_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_partnership_request(p_request_id);
$$;

create or replace function public.remove_partner()
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.remove_partner();
$$;

grant execute on function private.require_self() to authenticated;
grant execute on function private.lock_profile_pair(uuid, uuid) to authenticated;
grant execute on function private.form_partnership(uuid, uuid) to authenticated;
grant execute on function private.update_own_profile(text, text, text) to authenticated;
grant execute on function private.request_partnership(uuid) to authenticated;
grant execute on function private.accept_partnership(uuid) to authenticated;
grant execute on function private.decline_partnership(uuid) to authenticated;
grant execute on function private.cancel_partnership_request(uuid) to authenticated;
grant execute on function private.remove_partner() to authenticated;

grant execute on function public.update_own_profile(text, text, text) to authenticated;
grant execute on function public.request_partnership(uuid) to authenticated;
grant execute on function public.accept_partnership(uuid) to authenticated;
grant execute on function public.decline_partnership(uuid) to authenticated;
grant execute on function public.cancel_partnership_request(uuid) to authenticated;
grant execute on function public.remove_partner() to authenticated;
