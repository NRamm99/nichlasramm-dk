import { supabase } from "./supabase";
import type { PartnerPreview } from "./profile";

export type MatchStatus = "scheduled" | "played";

export type MatchRow = {
  id: string;
  created_at: string;
  created_by: string | null;
  played_at: string;
  status: MatchStatus;
  league_fixture_id?: string | null;
};

export const MATCH_SELECT =
  "id, created_at, created_by, played_at, status, league_fixture_id";

export function isLeagueMatch(row: Pick<MatchRow, "league_fixture_id">) {
  return Boolean(row.league_fixture_id);
}

export type MatchPlayer = {
  id: string;
  match_id: string;
  team: 1 | 2;
  slot: 1 | 2;
  profile_id: string | null;
  guest_name: string | null;
  display_name: string;
};

export type MatchSet = {
  id: string;
  match_id: string;
  set_number: number;
  team1_games: number;
  team2_games: number;
};

export type MatchComment = {
  id: string;
  match_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: PartnerPreview | null;
};

export type PlayerPick =
  | { kind: "member"; id: string }
  | { kind: "guest"; name: string };

export function playerPickToJson(pick: PlayerPick | null) {
  if (!pick) return null;
  if (pick.kind === "member") return { profile_id: pick.id };
  return { guest_name: pick.name.trim() };
}

export function matchPlayerToPick(player: MatchPlayer): PlayerPick {
  if (player.profile_id) return { kind: "member", id: player.profile_id };
  return { kind: "guest", name: player.guest_name ?? player.display_name };
}

export function orderedMatchPlayers(players: MatchPlayer[]) {
  return [...players].sort((a, b) => a.team - b.team || a.slot - b.slot);
}

export function isSinglesMatch(players: MatchPlayer[]) {
  return players.length === 2;
}

export function picksFromMatchPlayers(players: MatchPlayer[]) {
  if (isSinglesMatch(players)) {
    const team1 = players.find((row) => row.team === 1 && row.slot === 1);
    const team2 = players.find((row) => row.team === 2 && row.slot === 1);
    return [
      team1 ? matchPlayerToPick(team1) : null,
      team2 ? matchPlayerToPick(team2) : null,
    ];
  }
  const ordered = orderedMatchPlayers(players);
  return [0, 1, 2, 3].map((index) => {
    const row = ordered[index];
    return row ? matchPlayerToPick(row) : null;
  }) as [
    PlayerPick | null,
    PlayerPick | null,
    PlayerPick | null,
    PlayerPick | null,
  ];
}

export function rosterPicksToJson(
  picks: Array<PlayerPick | null>,
): Array<Record<string, unknown>> | null {
  if (picks.length === 2) {
    const first = playerPickToJson(picks[0] ?? null);
    const second = playerPickToJson(picks[1] ?? null);
    if (!first || !second) return null;
    return [
      { team: 1, slot: 1, ...first },
      { team: 2, slot: 1, ...second },
    ];
  }
  const payload = picks.map((pick, index) => {
    const json = playerPickToJson(pick);
    if (!json) return null;
    return {
      team: index < 2 ? 1 : 2,
      slot: index % 2 === 0 ? 1 : 2,
      ...json,
    };
  });
  if (payload.some((row) => row === null)) return null;
  return payload as Array<Record<string, unknown>>;
}

export function isValidSetScore(team1: number, team2: number) {
  return (
    Number.isInteger(team1) &&
    Number.isInteger(team2) &&
    team1 >= 0 &&
    team2 >= 0 &&
    team1 <= 7 &&
    team2 <= 7
  );
}

export function isCompleteSet(team1: number, team2: number) {
  return isValidSetScore(team1, team2) && team1 !== team2 && Math.max(team1, team2) >= 6;
}

export function isUnfinishedSet(team1: number, team2: number) {
  return isValidSetScore(team1, team2) && !isCompleteSet(team1, team2);
}

export function validateMatchSets(sets: Array<{ team1: number; team2: number }>) {
  if (sets.length < 1) return "MATCH_SETS_REQUIRED";
  if (sets.length > 5) return "TOO_MANY_SETS";

  for (const [index, row] of sets.entries()) {
    if (!isValidSetScore(row.team1, row.team2)) return "INVALID_SET";
    const last = index === sets.length - 1;
    if (!isCompleteSet(row.team1, row.team2) && !last) {
      return "UNFINISHED_SET_NOT_LAST";
    }
  }

  return null;
}

export function setScoreLine(sets: MatchSet[]) {
  const ordered = [...sets].sort((a, b) => a.set_number - b.set_number);
  if (ordered.length === 0) return "Ikke spillet";
  return ordered
    .map((row) => {
      const score = `${row.team1_games}–${row.team2_games}`;
      return isCompleteSet(row.team1_games, row.team2_games) ? score : `${score}*`;
    })
    .join("  ");
}

export function teamSetWins(sets: MatchSet[]) {
  let team1 = 0;
  let team2 = 0;
  let unfinished: MatchSet | null = null;

  for (const row of sets) {
    if (isCompleteSet(row.team1_games, row.team2_games)) {
      if (row.team1_games > row.team2_games) team1 += 1;
      else team2 += 1;
      continue;
    }
    if (isUnfinishedSet(row.team1_games, row.team2_games)) {
      unfinished = row;
    }
  }

  if (
    team1 === team2 &&
    unfinished &&
    unfinished.team1_games !== unfinished.team2_games
  ) {
    if (unfinished.team1_games > unfinished.team2_games) team1 += 1;
    else team2 += 1;
  }

  return { team1, team2 };
}

export function matchOutcome(sets: MatchSet[]) {
  const { team1, team2 } = teamSetWins(sets);
  const unfinished = sets.some((row) =>
    isUnfinishedSet(row.team1_games, row.team2_games),
  );
  const winner: 1 | 2 | null = team1 === team2 ? null : team1 > team2 ? 1 : 2;
  return { team1, team2, winner, unfinished };
}

export function resultForTeam(sets: MatchSet[], team: 1 | 2) {
  const { winner } = matchOutcome(sets);
  if (!winner) return "U" as const;
  return winner === team ? ("V" as const) : ("T" as const);
}

export type FormLetter = "W" | "U" | "L";

export type PlayerRecord = {
  wins: number;
  draws: number;
  losses: number;
  played: number;
  recentPlayed: number;
  recentWinRate: number | null;
  recentForm: FormLetter[];
};

export function emptyPlayerRecord(): PlayerRecord {
  return {
    wins: 0,
    draws: 0,
    losses: 0,
    played: 0,
    recentPlayed: 0,
    recentWinRate: null,
    recentForm: [],
  };
}

function resultToForm(result: "V" | "U" | "T"): FormLetter {
  if (result === "V") return "W";
  if (result === "T") return "L";
  return "U";
}

export function recordFromResults(results: Array<"V" | "U" | "T">): PlayerRecord {
  const wins = results.filter((row) => row === "V").length;
  const draws = results.filter((row) => row === "U").length;
  const losses = results.filter((row) => row === "T").length;
  const recent = results.slice(0, 10);
  const lastFive = results.slice(0, 5).reverse();
  return {
    wins,
    draws,
    losses,
    played: results.length,
    recentPlayed: recent.length,
    recentWinRate:
      recent.length === 0
        ? null
        : Math.round((recent.filter((row) => row === "V").length / recent.length) * 100),
    recentForm: lastFive.map(resultToForm),
  };
}

export type MatchCard = MatchRow & {
  players: MatchPlayer[];
  sets: MatchSet[];
  disputed?: boolean;
};

export type ProposedSetScore = { team1: number; team2: number };

export type MatchResultCorrection = {
  match_id: string;
  proposed_by: string;
  sets: ProposedSetScore[];
  players: ProposedMatchPlayer[] | null;
  created_at: string;
};

export type ProposedMatchPlayer = {
  team: number;
  slot: number;
  profile_id: string | null;
  guest_name: string | null;
};

export function parseProposedPlayers(value: unknown): ProposedMatchPlayer[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rows = value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const data = row as {
      team?: unknown;
      slot?: unknown;
      profile_id?: unknown;
      guest_name?: unknown;
    };
    const team = Number(data.team);
    const slot = Number(data.slot);
    if (team !== 1 && team !== 2) return [];
    if (slot !== 1 && slot !== 2) return [];
    return [
      {
        team,
        slot,
        profile_id:
          typeof data.profile_id === "string" && data.profile_id
            ? data.profile_id
            : null,
        guest_name:
          typeof data.guest_name === "string" && data.guest_name
            ? data.guest_name
            : null,
      },
    ];
  });
  return rows.length === 2 || rows.length === 4 ? rows : null;
}

export function matchSetsToForm(sets: MatchSet[]) {
  return [...sets]
    .sort((a, b) => a.set_number - b.set_number)
    .map((row) => ({
      team1: String(row.team1_games),
      team2: String(row.team2_games),
    }));
}

export function proposedSetScoreLine(sets: ProposedSetScore[]) {
  return setScoreLine(
    sets.map((row, index) => ({
      id: String(index),
      match_id: "",
      set_number: index + 1,
      team1_games: row.team1,
      team2_games: row.team2,
    })),
  );
}

export function parseProposedSets(value: unknown): ProposedSetScore[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const team1 = Number((row as { team1?: unknown }).team1);
    const team2 = Number((row as { team2?: unknown }).team2);
    if (!Number.isInteger(team1) || !Number.isInteger(team2)) return [];
    return [{ team1, team2 }];
  });
}

export async function fetchDisputedMatchIds(ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const { data, error } = await supabase
    .from("match_result_corrections")
    .select("match_id")
    .in("match_id", ids);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.match_id as string));
}

export async function fetchPlayerMatches(profileId: string): Promise<MatchCard[]> {
  const { data: appearances, error: appearanceError } = await supabase
    .from("match_players")
    .select("match_id")
    .eq("profile_id", profileId);

  if (appearanceError) throw appearanceError;
  if (!appearances || appearances.length === 0) return [];

  const ids = [...new Set(appearances.map((row) => row.match_id))];
  const [{ data: matches }, { data: playerRows }, { data: setRows }, disputed] =
    await Promise.all([
      supabase
        .from("matches")
        .select(MATCH_SELECT)
        .in("id", ids),
      supabase.from("match_players").select("*").in("match_id", ids),
      supabase.from("match_sets").select("*").in("match_id", ids),
      fetchDisputedMatchIds(ids),
    ]);

  return ((matches ?? []) as MatchRow[]).map((row) => ({
    ...row,
    disputed: disputed.has(row.id),
    players: ((playerRows ?? []) as MatchPlayer[]).filter(
      (player) => player.match_id === row.id,
    ),
    sets: ((setRows ?? []) as MatchSet[]).filter(
      (setRow) => setRow.match_id === row.id,
    ),
  }));
}

export function recordFromPlayerMatches(
  profileId: string,
  matches: MatchCard[],
): PlayerRecord {
  const results = [...matches]
    .filter((row) => row.status === "played" && row.sets.length > 0 && !row.disputed)
    .sort(
      (a, b) =>
        new Date(b.played_at).getTime() - new Date(a.played_at).getTime(),
    )
    .map((row) => {
      const team = row.players.find((player) => player.profile_id === profileId)
        ?.team === 2
        ? 2
        : 1;
      return resultForTeam(row.sets, team);
    });

  return recordFromResults(results);
}

export async function fetchPlayerRecord(profileId: string): Promise<PlayerRecord> {
  return recordFromPlayerMatches(profileId, await fetchPlayerMatches(profileId));
}

export function formatMatchWhen(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatNextMatchWhen(value: string) {
  const date = new Date(value);
  const time = new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  if (isSameLocalDay(date, new Date())) {
    return `I dag, ${time}`;
  }
  return formatMatchWhen(value);
}

export function toDatetimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function teamPlayers(players: MatchPlayer[], team: 1 | 2) {
  return players
    .filter((player) => player.team === team)
    .sort((a, b) => a.slot - b.slot);
}

export function teamNames(players: MatchPlayer[], team: 1 | 2) {
  const names = teamPlayers(players, team).map((player) => player.display_name);
  return names.join(" / ") || "Ukendt hold";
}
