alter table public.profiles
  add column if not exists partnered_at timestamptz;

with first_together as (
  select
    least(a.profile_id, b.profile_id) as left_id,
    greatest(a.profile_id, b.profile_id) as right_id,
    min(m.played_at) as since
  from public.match_players a
  join public.match_players b
    on a.match_id = b.match_id
   and a.team = b.team
   and a.profile_id < b.profile_id
  join public.matches m on m.id = a.match_id
  where a.profile_id is not null
    and b.profile_id is not null
    and m.status = 'played'
  group by 1, 2
)
update public.profiles p
set partnered_at = coalesce(
  (
    select ft.since
    from first_together ft
    where ft.left_id = least(p.id, p.partner_id)
      and ft.right_id = greatest(p.id, p.partner_id)
  ),
  now()
)
where p.partner_id is not null
  and p.partnered_at is null;

alter table public.profiles
  drop constraint if exists profiles_partnered_at_ok;

alter table public.profiles
  add constraint profiles_partnered_at_ok check (
    (partner_id is null and partnered_at is null)
    or (partner_id is not null and partnered_at is not null)
  );

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
    partnered_at = now(),
    seeking_partner = false,
    seeking_note = null
  where id = p_a;

  update public.profiles
  set
    partner_id = p_a,
    partnered_at = now(),
    seeking_partner = false,
    seeking_note = null
  where id = p_b;

  delete from public.partnership_requests
  where requester_id in (p_a, p_b)
     or recipient_id in (p_a, p_b);
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
  set
    partner_id = null,
    partnered_at = null
  where id in (current_id, other_id);

  return true;
end;
$$;
