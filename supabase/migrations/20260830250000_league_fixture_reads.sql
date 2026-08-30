create table public.league_fixture_reads (
  fixture_id uuid not null references public.league_fixtures (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (fixture_id, profile_id)
);

alter table public.league_fixture_reads enable row level security;

revoke all on public.league_fixture_reads from anon, authenticated;
grant select on public.league_fixture_reads to authenticated;

drop policy if exists league_fixture_reads_select_own on public.league_fixture_reads;
create policy league_fixture_reads_select_own
  on public.league_fixture_reads for select to authenticated
  using (
    profile_id = auth.uid()
    and private.is_active_member()
    and private.is_league_fixture_player(fixture_id)
  );

create or replace function private.mark_league_fixture_read(p_fixture_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_member() then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (select 1 from public.league_fixtures where id = p_fixture_id) then
    raise exception 'FIXTURE_NOT_FOUND';
  end if;

  if not private.is_league_fixture_player(p_fixture_id) then
    raise exception 'NOT_FIXTURE_PLAYER';
  end if;

  insert into public.league_fixture_reads (fixture_id, profile_id, last_read_at)
  values (p_fixture_id, auth.uid(), now())
  on conflict (fixture_id, profile_id)
  do update set last_read_at = now();
end;
$$;

create or replace function public.mark_league_fixture_read(p_fixture_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.mark_league_fixture_read(p_fixture_id);
$$;

grant execute on function private.mark_league_fixture_read(uuid) to authenticated;
grant execute on function public.mark_league_fixture_read(uuid) to authenticated;
