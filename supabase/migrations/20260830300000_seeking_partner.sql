alter table public.profiles
  add column if not exists seeking_partner boolean not null default false,
  add column if not exists seeking_note text;

alter table public.profiles
  drop constraint if exists profiles_seeking_note_ok;

alter table public.profiles
  add constraint profiles_seeking_note_ok check (
    (
      not seeking_partner
      and seeking_note is null
    )
    or (
      seeking_partner
      and partner_id is null
      and char_length(trim(seeking_note)) between 1 and 200
    )
  );

create index if not exists profiles_seeking_partner_idx
  on public.profiles (seeking_partner)
  where seeking_partner;

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

  update public.profiles
  set
    partner_id = p_b,
    seeking_partner = false,
    seeking_note = null
  where id = p_a;

  update public.profiles
  set
    partner_id = p_a,
    seeking_partner = false,
    seeking_note = null
  where id = p_b;

  delete from public.partnership_requests
  where requester_id in (p_a, p_b)
     or recipient_id in (p_a, p_b);
end;
$$;

create or replace function private.set_seeking_partner(p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  cleaned text;
begin
  current_id := private.require_self();

  if exists (
    select 1 from public.profiles where id = current_id and partner_id is not null
  ) then
    raise exception 'HAS_PARTNER';
  end if;

  cleaned := left(trim(coalesce(p_note, '')), 200);
  if cleaned = '' then
    raise exception 'SEEKING_NOTE_REQUIRED';
  end if;

  update public.profiles
  set seeking_partner = true, seeking_note = cleaned
  where id = current_id;
end;
$$;

create or replace function private.clear_seeking_partner()
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
  set seeking_partner = false, seeking_note = null
  where id = current_id;
end;
$$;

create or replace function public.set_seeking_partner(p_note text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_seeking_partner(p_note);
$$;

create or replace function public.clear_seeking_partner()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.clear_seeking_partner();
$$;

grant execute on function private.set_seeking_partner(text) to authenticated;
grant execute on function private.clear_seeking_partner() to authenticated;
grant execute on function public.set_seeking_partner(text) to authenticated;
grant execute on function public.clear_seeking_partner() to authenticated;
