alter table public.matches drop constraint if exists matches_created_by_fkey;
drop table if exists public.match_comments cascade;
drop table if exists public.match_sets cascade;
drop table if exists public.match_players cascade;
drop table if exists public.matches cascade;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  played_at timestamptz not null,
  status text not null check (status in ('scheduled', 'played'))
);

create table public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  team smallint not null check (team in (1, 2)),
  slot smallint not null check (slot in (1, 2)),
  profile_id uuid references public.profiles (id) on delete set null,
  guest_name text,
  display_name text not null,
  constraint match_players_identity check (
    (profile_id is not null and guest_name is null)
    or (profile_id is null and guest_name is not null)
  ),
  constraint match_players_unique_slot unique (match_id, team, slot)
);

create unique index match_players_profile_once
  on public.match_players (match_id, profile_id)
  where profile_id is not null;

create table public.match_sets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  set_number smallint not null check (set_number between 1 and 5),
  team1_games smallint not null check (team1_games between 0 and 7),
  team2_games smallint not null check (team2_games between 0 and 7),
  constraint match_sets_unique_number unique (match_id, set_number),
  constraint match_sets_has_winner check (
    team1_games <> team2_games
    and greatest(team1_games, team2_games) >= 6
  )
);

create table public.match_comments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index matches_played_at_idx on public.matches (played_at desc);
create index match_players_match_idx on public.match_players (match_id);
create index match_sets_match_idx on public.match_sets (match_id);
create index match_comments_match_idx on public.match_comments (match_id, created_at);

alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_sets enable row level security;
alter table public.match_comments enable row level security;

revoke all on public.matches from anon, authenticated;
revoke all on public.match_players from anon, authenticated;
revoke all on public.match_sets from anon, authenticated;
revoke all on public.match_comments from anon, authenticated;

grant select on public.matches to authenticated;
grant select on public.match_players to authenticated;
grant select on public.match_sets to authenticated;
grant select on public.match_comments to authenticated;

create or replace function private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and banned_at is null
  );
$$;

create or replace function private.is_match_participant(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.match_players
    where match_id = p_match_id
      and profile_id = auth.uid()
  );
$$;

drop policy if exists matches_select_members on public.matches;
create policy matches_select_members
  on public.matches
  for select
  to authenticated
  using (private.is_active_member());

drop policy if exists match_players_select_members on public.match_players;
create policy match_players_select_members
  on public.match_players
  for select
  to authenticated
  using (private.is_active_member());

drop policy if exists match_sets_select_members on public.match_sets;
create policy match_sets_select_members
  on public.match_sets
  for select
  to authenticated
  using (private.is_active_member());

drop policy if exists match_comments_select_members on public.match_comments;
create policy match_comments_select_members
  on public.match_comments
  for select
  to authenticated
  using (private.is_active_member());
