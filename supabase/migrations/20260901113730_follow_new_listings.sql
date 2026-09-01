create table public.matchmaker_listing_follows (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.matchmaker_listing_follows enable row level security;

revoke all on public.matchmaker_listing_follows from public, anon, authenticated;
grant select on public.matchmaker_listing_follows to authenticated;

drop policy if exists matchmaker_listing_follows_select_own on public.matchmaker_listing_follows;
create policy matchmaker_listing_follows_select_own
  on public.matchmaker_listing_follows for select to authenticated
  using (profile_id = (select auth.uid()) and private.is_active_member());

create or replace function private.set_follow_new_listings(p_follow boolean)
returns boolean
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

  if coalesce(p_follow, false) then
    insert into public.matchmaker_listing_follows (profile_id)
    values (current_id)
    on conflict (profile_id) do nothing;
    return true;
  end if;

  delete from public.matchmaker_listing_follows
  where profile_id = current_id;
  return false;
end;
$$;

create or replace function public.set_follow_new_listings(p_follow boolean)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.set_follow_new_listings(p_follow);
$$;

create or replace function private.create_matchmaker_listing(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text,
  p_note text,
  p_partner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  new_id uuid;
  seats smallint;
  loc text;
  note text;
  sender_name text;
  follower_id uuid;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_starts_at is null or p_ends_at is null then
    raise exception 'INVALID_WHEN';
  end if;
  if p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '8 hours' then
    raise exception 'WINDOW_TOO_LONG';
  end if;
  if p_ends_at <= now() then
    raise exception 'INVALID_WHEN';
  end if;

  loc := nullif(left(trim(coalesce(p_location, '')), 120), '');
  note := nullif(left(trim(coalesce(p_note, '')), 500), '');

  if p_partner_id is not null then
    if p_partner_id = current_id then
      raise exception 'CANNOT_PARTNER_SELF';
    end if;
    if not exists (
      select 1 from public.profiles
      where id = p_partner_id and banned_at is null
    ) then
      raise exception 'MEMBER_NOT_FOUND';
    end if;
    seats := 2;
  else
    seats := 1;
  end if;

  insert into public.matchmaker_listings (
    host_id, starts_at, ends_at, location, note, host_seats, brought_partner_id
  )
  values (current_id, p_starts_at, p_ends_at, loc, note, seats, p_partner_id)
  returning id into new_id;

  if p_partner_id is not null then
    perform private.notify(
      p_partner_id,
      'matchmaker_rsvp',
      jsonb_build_object('listing_id', new_id, 'href', '/matchmaker/' || new_id)
    );
  end if;

  sender_name := private.profile_display_name(current_id);

  for follower_id in
    select f.profile_id
    from public.matchmaker_listing_follows f
    join public.profiles p on p.id = f.profile_id
    where f.profile_id <> current_id
      and f.profile_id is distinct from p_partner_id
      and p.banned_at is null
  loop
    perform private.notify(
      follower_id,
      'matchmaker_listing',
      jsonb_build_object(
        'listing_id', new_id,
        'href', '/matchmaker/' || new_id,
        'from', sender_name,
        'body', case
          when loc is not null then 'Nyt find-kamp-opslag · ' || loc
          else 'Nyt find-kamp-opslag.'
        end
      )
    );
  end loop;

  return new_id;
end;
$$;

revoke all on function private.set_follow_new_listings(boolean) from public, anon;
revoke all on function public.set_follow_new_listings(boolean) from public, anon;
grant execute on function private.set_follow_new_listings(boolean) to authenticated;
grant execute on function public.set_follow_new_listings(boolean) to authenticated;
