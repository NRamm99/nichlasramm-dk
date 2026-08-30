import { matchOutcome, type MatchPlayer, type MatchSet } from "./match";
import { fullName, type PartnerPreview } from "./profile";
import { supabase } from "./supabase";

export type League = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  signup_deadline: string;
  created_at: string;
};

export type LeagueTeamPlayer = {
  league_id: string;
  team_id: string;
  profile_id: string;
  slot: 1 | 2;
};

export type LeagueJoinRequest = {
  id: string;
  league_id: string;
  requester_id: string;
  recipient_id: string;
  created_at: string;
  other: PartnerPreview | null;
};

export type LeagueTeam = {
  id: string;
  league_id: string;
  created_at: string;
  created_by: string;
  players: PartnerPreview[];
};

export type LeagueFixture = {
  id: string;
  league_id: string;
  team_a_id: string;
  team_b_id: string;
  created_at: string;
  match_id: string | null;
};

export type LeagueMessage = {
  id: string;
  fixture_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type StandingRow = {
  teamId: string;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
};

export function formatLeagueDay(value: string) {
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatLeagueWhen(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function teamName(players: PartnerPreview[]) {
  const names = players.map((player) => fullName(player));
  return names.join(" / ") || "Ukendt hold";
}

export function messageAuthorName(teams: LeagueTeam[], authorId: string) {
  for (const team of teams) {
    const person = team.players.find((player) => player.id === authorId);
    if (person) return fullName(person);
  }
  return "Ukendt";
}

export function fixtureHasUnread(
  lastOtherAt: string | undefined,
  lastReadAt: string | undefined,
) {
  if (!lastOtherAt) return false;
  if (!lastReadAt) return true;
  return new Date(lastOtherAt).getTime() > new Date(lastReadAt).getTime();
}

export function leagueStandings(
  teams: LeagueTeam[],
  fixtures: LeagueFixture[],
  matchPlayers: MatchPlayer[],
  setsByMatch: Map<string, MatchSet[]>,
  matchStatus: Map<string, "scheduled" | "played">,
  disputedMatchIds: Set<string> = new Set(),
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const playerIds = new Map<string, Set<string>>();
  for (const team of teams) {
    rows.set(team.id, {
      teamId: team.id,
      name: teamName(team.players),
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
    });
    playerIds.set(
      team.id,
      new Set(team.players.map((player) => player.id)),
    );
  }

  for (const fixture of fixtures) {
    if (!fixture.match_id) continue;
    if (disputedMatchIds.has(fixture.match_id)) continue;
    if (matchStatus.get(fixture.match_id) !== "played") continue;
    const sets = setsByMatch.get(fixture.match_id) ?? [];
    if (sets.length === 0) continue;
    const players = matchPlayers.filter(
      (player) => player.match_id === fixture.match_id,
    );
    const team1Ids = players
      .filter((player) => player.team === 1 && player.profile_id)
      .map((player) => player.profile_id as string);
    const idsA = playerIds.get(fixture.team_a_id);
    if (!idsA) continue;
    const matchTeam1IsA = team1Ids.every((id) => idsA.has(id));
    const leagueTeam1 = matchTeam1IsA ? fixture.team_a_id : fixture.team_b_id;
    const leagueTeam2 = matchTeam1IsA ? fixture.team_b_id : fixture.team_a_id;
    const row1 = rows.get(leagueTeam1);
    const row2 = rows.get(leagueTeam2);
    if (!row1 || !row2) continue;

    const outcome = matchOutcome(sets);
    row1.played += 1;
    row2.played += 1;
    if (!outcome.winner) {
      row1.draws += 1;
      row2.draws += 1;
      row1.points += 1;
      row2.points += 1;
    } else if (outcome.winner === 1) {
      row1.wins += 1;
      row1.points += 3;
      row2.losses += 1;
    } else {
      row2.wins += 1;
      row2.points += 3;
      row1.losses += 1;
    }
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name, "da"),
  );
}

export function leagueIsRunning(league: League) {
  const end = league.ends_on.includes("T")
    ? new Date(league.ends_on)
    : new Date(`${league.ends_on}T23:59:59`);
  return end.getTime() >= Date.now();
}

export async function fetchLatestLeague() {
  const { data, error } = await supabase
    .from("leagues")
    .select("id, name, starts_on, ends_on, signup_deadline, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as League | null) ?? null;
}
