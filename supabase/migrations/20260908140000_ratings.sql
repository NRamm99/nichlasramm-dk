create table if not exists public.rating_settings (
  id boolean primary key default true,
  start_rating integer not null default 1000,
  k_base numeric(6, 2) not null default 24,
  k_provisional numeric(6, 2) not null default 64,
  provisional_matches integer not null default 10,
  guest_rating integer not null default 1000,
  guest_damping numeric(4, 3) not null default 0.75,
  weak_link_weight numeric(4, 3) not null default 0.55,
  pair_split_max numeric(4, 3) not null default 0.5,
  pair_split_scale integer not null default 400,
  mov_enabled boolean not null default true,
  mov_min numeric(4, 3) not null default 0.75,
  mov_max numeric(4, 3) not null default 1.25,
  mov_span integer not null default 12,
  include_singles boolean not null default true,
  constraint rating_settings_single_row check (id),
  constraint rating_settings_start check (start_rating between 100 and 5000),
  constraint rating_settings_k check (k_base > 0 and k_provisional >= k_base),
  constraint rating_settings_provisional check (provisional_matches >= 0),
  constraint rating_settings_guest check (
    guest_rating between 100 and 5000
    and guest_damping > 0
    and guest_damping <= 1
  ),
  constraint rating_settings_weak_link check (weak_link_weight between 0.5 and 1),
  constraint rating_settings_pair_split check (
    pair_split_max >= 0
    and pair_split_max <= 1
    and pair_split_scale > 0
  ),
  constraint rating_settings_mov check (
    mov_min > 0
    and mov_max >= mov_min
    and mov_span > 0
  )
);

insert into public.rating_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.player_ratings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  rating integer not null,
  matches_rated integer not null default 0,
  peak_rating integer not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.rating_events (
  match_id uuid not null references public.matches (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  played_at timestamptz not null,
  seq integer not null,
  match_index integer not null,
  rating_before integer not null,
  rating_after integer not null,
  delta integer not null,
  expected numeric(6, 4) not null,
  k_used numeric(6, 2) not null,
  primary key (match_id, profile_id)
);

create index if not exists player_ratings_rating_idx
  on public.player_ratings (rating desc);
create index if not exists rating_events_profile_seq_idx
  on public.rating_events (profile_id, seq desc);
create index if not exists rating_events_match_idx
  on public.rating_events (match_id);

alter table public.rating_settings enable row level security;
alter table public.player_ratings enable row level security;
alter table public.rating_events enable row level security;

revoke all on table public.rating_settings from anon, authenticated;
revoke all on table public.player_ratings from anon, authenticated;
revoke all on table public.rating_events from anon, authenticated;

grant select on table public.rating_settings to authenticated;
grant select on table public.player_ratings to authenticated;
grant select on table public.rating_events to authenticated;

drop policy if exists rating_settings_select_members on public.rating_settings;
create policy rating_settings_select_members
  on public.rating_settings
  for select
  to authenticated
  using (private.is_active_member());

drop policy if exists player_ratings_select_members on public.player_ratings;
create policy player_ratings_select_members
  on public.player_ratings
  for select
  to authenticated
  using (private.is_active_member());

drop policy if exists rating_events_select_members on public.rating_events;
create policy rating_events_select_members
  on public.rating_events
  for select
  to authenticated
  using (private.is_active_member());
