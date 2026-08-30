alter table public.match_sets drop constraint if exists match_sets_has_winner;

create or replace function private.insert_match_sets(p_match_id uuid, p_sets jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  set_row jsonb;
  set_no integer := 0;
  total integer;
  games1 integer;
  games2 integer;
  complete boolean;
begin
  if p_sets is null or jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) < 1 then
    raise exception 'MATCH_SETS_REQUIRED';
  end if;

  total := jsonb_array_length(p_sets);
  if total > 5 then
    raise exception 'TOO_MANY_SETS';
  end if;

  for set_row in select value from jsonb_array_elements(p_sets)
  loop
    set_no := set_no + 1;
    games1 := coalesce((set_row ->> 'team1')::int, -1);
    games2 := coalesce((set_row ->> 'team2')::int, -1);

    if games1 < 0 or games1 > 7 or games2 < 0 or games2 > 7 then
      raise exception 'INVALID_SET';
    end if;

    complete := games1 <> games2 and greatest(games1, games2) >= 6;

    if not complete and set_no <> total then
      raise exception 'UNFINISHED_SET_NOT_LAST';
    end if;

    insert into public.match_sets (match_id, set_number, team1_games, team2_games)
    values (p_match_id, set_no, games1, games2);
  end loop;
end;
$$;
