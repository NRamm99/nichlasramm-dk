import { supabase } from "./supabase";
import type { PartnerPreview } from "./profile";

export type MatchStatus = "scheduled" | "played";

export type MatchRow = {
  id: string;
  created_at: string;
  created_by: string;
  played_at: string;
  status: MatchStatus;
};

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
  for (const row of sets) {
    if (row.team1_games === row.team2_games) continue;
    if (row.team1_games > row.team2_games) team1 += 1;
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

export type PlayerRecord = {
  wins: number;
  draws: number;
  losses: number;
  played: number;
  recentPlayed: number;
  recentWinRate: number | null;
};

export function emptyPlayerRecord(): PlayerRecord {
  return {
    wins: 0,
    draws: 0,
    losses: 0,
    played: 0,
    recentPlayed: 0,
    recentWinRate: null,
  };
}

export function recordFromResults(results: Array<"V" | "U" | "T">): PlayerRecord {
  const wins = results.filter((row) => row === "V").length;
  const draws = results.filter((row) => row === "U").length;
  const losses = results.filter((row) => row === "T").length;
  const recent = results.slice(0, 10);
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
  };
}

export type MatchCard = MatchRow & {
  players: MatchPlayer[];
  sets: MatchSet[];
};

export async function fetchPlayerMatches(profileId: string): Promise<MatchCard[]> {
  const { data: appearances, error: appearanceError } = await supabase
    .from("match_players")
    .select("match_id")
    .eq("profile_id", profileId);

  if (appearanceError) throw appearanceError;
  if (!appearances || appearances.length === 0) return [];

  const ids = [...new Set(appearances.map((row) => row.match_id))];
  const [{ data: matches }, { data: playerRows }, { data: setRows }] =
    await Promise.all([
      supabase
        .from("matches")
        .select("id, created_at, created_by, played_at, status")
        .in("id", ids),
      supabase.from("match_players").select("*").in("match_id", ids),
      supabase.from("match_sets").select("*").in("match_id", ids),
    ]);

  return ((matches ?? []) as MatchRow[]).map((row) => ({
    ...row,
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
    .filter((row) => row.status === "played" && row.sets.length > 0)
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
