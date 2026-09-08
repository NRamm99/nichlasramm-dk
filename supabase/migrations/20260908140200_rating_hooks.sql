-- Every RPC that can change a rated result recalculates afterwards. Only the thin
-- public wrappers are redefined so the business logic in private.* stays put.

create or replace function public.create_match(
  p_status text,
  p_played_at timestamptz,
  p_partner jsonb,
  p_opponent1 jsonb,
  p_opponent2 jsonb,
  p_sets jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result uuid;
begin
  v_result := private.create_match(
    p_status, p_played_at, p_partner, p_opponent1, p_opponent2, p_sets
  );
  perform private.recalculate_ratings();
  return v_result;
end;
$$;

create or replace function public.record_match_result(p_match_id uuid, p_sets jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result boolean;
begin
  v_result := private.record_match_result(p_match_id, p_sets);
  perform private.recalculate_ratings();
  return v_result;
end;
$$;

create or replace function public.create_league_match(
  p_fixture_id uuid,
  p_status text,
  p_played_at timestamptz,
  p_sets jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result uuid;
begin
  v_result := private.create_league_match(
    p_fixture_id, p_status, p_played_at, p_sets
  );
  perform private.recalculate_ratings();
  return v_result;
end;
$$;

create or replace function public.create_matchmaker_court_match(
  p_listing_id uuid,
  p_court integer,
  p_played_at timestamptz,
  p_players uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result uuid;
begin
  v_result := private.create_matchmaker_court_match(
    p_listing_id, p_court, p_played_at, p_players
  );
  perform private.recalculate_ratings();
  return v_result;
end;
$$;

create or replace function public.delete_match(p_match_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result boolean;
begin
  v_result := private.delete_match(p_match_id);
  perform private.recalculate_ratings();
  return v_result;
end;
$$;

-- Proposing a correction matters too: it marks the match disputed, which drops it
-- out of the rated set until the dispute is settled.
create or replace function public.propose_match_result_correction(
  p_match_id uuid,
  p_sets jsonb,
  p_players jsonb default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result boolean;
begin
  v_result := private.propose_match_result_correction(p_match_id, p_sets, p_players);
  perform private.recalculate_ratings();
  return v_result;
end;
$$;

create or replace function public.accept_match_result_correction(p_match_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result boolean;
begin
  v_result := private.accept_match_result_correction(p_match_id);
  perform private.recalculate_ratings();
  return v_result;
end;
$$;

create or replace function public.reject_match_result_correction(p_match_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result boolean;
begin
  v_result := private.reject_match_result_correction(p_match_id);
  perform private.recalculate_ratings();
  return v_result;
end;
$$;

create or replace function public.withdraw_match_result_correction(p_match_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result boolean;
begin
  v_result := private.withdraw_match_result_correction(p_match_id);
  perform private.recalculate_ratings();
  return v_result;
end;
$$;

create or replace function public.replace_match_result(
  p_match_id uuid,
  p_sets jsonb,
  p_players jsonb default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result boolean;
begin
  v_result := private.replace_match_result(p_match_id, p_sets, p_players);
  perform private.recalculate_ratings();
  return v_result;
end;
$$;

select private.recalculate_ratings();
