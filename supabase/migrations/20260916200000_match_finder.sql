create table public.match_finder_preferences (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('permanent', 'temporary')),
  weekday smallint not null check (weekday between 1 and 7),
  band text not null check (band in ('morning', 'noon', 'afternoon', 'evening')),
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (profile_id, kind, weekday, band),
  check (
    (kind = 'permanent' and expires_at is null)
    or (kind = 'temporary' and expires_at is not null)
  )
);

alter table public.profiles
  add column if not exists match_finder_hidden boolean not null default false;

alter table public.match_finder_preferences enable row level security;

revoke all on public.match_finder_preferences from public, anon, authenticated;
grant select on public.match_finder_preferences to authenticated;

-- Owner opted in and is not banned. Security definer so the policy does not
-- depend on the caller being able to read the owner's profile row.
create or replace function private.match_finder_visible(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = p_profile_id
      and banned_at is null
      and match_finder_hidden = false
  );
$$;

drop policy if exists match_finder_preferences_select on public.match_finder_preferences;
create policy match_finder_preferences_select
  on public.match_finder_preferences for select to authenticated
  using (
    private.is_active_member()
    and (
      profile_id = (select auth.uid())
      or private.match_finder_visible(profile_id)
    )
  );

create or replace function private.set_match_finder_preferences(
  p_kind text,
  p_slots jsonb,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  slot jsonb;
  slot_weekday int;
  slot_band text;
  slot_count int;
  expires timestamptz;
begin
  current_id := auth.uid();
  if current_id is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_kind is null or p_kind not in ('permanent', 'temporary') then
    raise exception 'INVALID_KIND';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'INVALID_SLOT';
  end if;
  slot_count := jsonb_array_length(p_slots);
  if slot_count > 28 then
    raise exception 'INVALID_SLOT';
  end if;

  if p_kind = 'temporary' and slot_count > 0 then
    if p_expires_at is null
      or p_expires_at < now() + interval '1 hour'
      or p_expires_at > now() + interval '30 days'
    then
      raise exception 'INVALID_EXPIRY';
    end if;
    expires := p_expires_at;
  else
    expires := null;
  end if;

  -- Replace-all for the requested kind, and drop any stale temporary overlay
  -- so it can never linger past its expiry.
  delete from public.match_finder_preferences
  where profile_id = current_id
    and (kind = p_kind or (kind = 'temporary' and expires_at <= now()));

  for slot in select value from jsonb_array_elements(p_slots)
  loop
    if jsonb_typeof(slot) <> 'object'
      or jsonb_typeof(slot -> 'weekday') <> 'number'
      or jsonb_typeof(slot -> 'band') <> 'string'
    then
      raise exception 'INVALID_SLOT';
    end if;
    slot_weekday := (slot ->> 'weekday')::int;
    slot_band := slot ->> 'band';
    if slot_weekday < 1 or slot_weekday > 7
      or slot_band not in ('morning', 'noon', 'afternoon', 'evening')
    then
      raise exception 'INVALID_SLOT';
    end if;

    insert into public.match_finder_preferences (
      profile_id, kind, weekday, band, expires_at, updated_at
    )
    values (current_id, p_kind, slot_weekday, slot_band, expires, now())
    on conflict (profile_id, kind, weekday, band) do update
      set expires_at = excluded.expires_at,
          updated_at = excluded.updated_at;
  end loop;
end;
$$;

create or replace function public.set_match_finder_preferences(
  p_kind text,
  p_slots jsonb,
  p_expires_at timestamptz default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_match_finder_preferences(p_kind, p_slots, p_expires_at);
$$;

create or replace function private.set_match_finder_hidden(p_hidden boolean)
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
  set match_finder_hidden = coalesce(p_hidden, false)
  where id = current_id;
end;
$$;

create or replace function public.set_match_finder_hidden(p_hidden boolean)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_match_finder_hidden(p_hidden);
$$;

revoke all on function private.match_finder_visible(uuid) from public, anon;
revoke all on function private.set_match_finder_preferences(text, jsonb, timestamptz) from public, anon;
revoke all on function public.set_match_finder_preferences(text, jsonb, timestamptz) from public, anon;
revoke all on function private.set_match_finder_hidden(boolean) from public, anon;
revoke all on function public.set_match_finder_hidden(boolean) from public, anon;

grant execute on function private.match_finder_visible(uuid) to authenticated;
grant execute on function private.set_match_finder_preferences(text, jsonb, timestamptz) to authenticated;
grant execute on function public.set_match_finder_preferences(text, jsonb, timestamptz) to authenticated;
grant execute on function private.set_match_finder_hidden(boolean) to authenticated;
grant execute on function public.set_match_finder_hidden(boolean) to authenticated;
