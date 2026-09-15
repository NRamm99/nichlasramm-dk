import { matchOutcome, type MatchPlayer, type MatchSet } from "./match";
import { fullName, type PartnerPreview } from "./profile";
import { withRating } from "./rating";
import { supabase } from "./supabase";

export type League = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  signup_deadline: string;
  created_at: string;
  group_count: number;
  finals_on: string | null;
  finals_starts_at: string | null;
  finals_venue: string | null;
  finals_note: string | null;
  finals_tba: boolean;
};

export type LeagueGroup = {
  id: string;
  league_id: string;
  label: string;
  sort_order: number;
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
  created_by: string | null;
  group_id: string | null;
  players: PartnerPreview[];
};

export type LeagueFixtureStage = "group" | "knockout";
export type LeagueKnockoutRound = "semi" | "final";

export type LeagueFixture = {
  id: string;
  league_id: string;
  team_a_id: string;
  team_b_id: string;
  created_at: string;
  match_id: string | null;
  stage: LeagueFixtureStage;
  knockout_round: LeagueKnockoutRound | null;
  bracket_slot: 1 | 2 | null;
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

export function teamName(
  players: PartnerPreview[],
  ratings?: Map<string, number>,
) {
  const names = players.map((player) =>
    withRating(fullName(player), ratings?.get(player.id)),
  );
  return names.join(" / ") || "Ukendt hold";
}

export function messageAuthorName(
  teams: LeagueTeam[],
  authorId: string,
  ratings?: Map<string, number>,
) {
  for (const team of teams) {
    const person = team.players.find((player) => player.id === authorId);
    if (person) return withRating(fullName(person), ratings?.get(authorId));
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
  ratings?: Map<string, number>,
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  const playerIds = new Map<string, Set<string>>();
  for (const team of teams) {
    rows.set(team.id, {
      teamId: team.id,
      name: teamName(team.players, ratings),
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
    if ((fixture.stage ?? "group") === "knockout") continue;
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

export function leagueStandingsWindow<T extends { teamId: string }>(
  standings: T[],
  teamId: string,
  size = 3,
) {
  const index = standings.findIndex((row) => row.teamId === teamId);
  if (index < 0) return { start: 0, rows: [] as T[] };
  if (standings.length <= size) return { start: 0, rows: standings };
  const start =
    index === 0
      ? 0
      : index >= standings.length - 1
        ? standings.length - size
        : index - 1;
  return { start, rows: standings.slice(start, start + size) };
}

export function leagueIsRunning(league: League) {
  const end = league.ends_on.includes("T")
    ? new Date(league.ends_on)
    : new Date(`${league.ends_on}T23:59:59`);
  return end.getTime() >= Date.now();
}

export function asLeagueFixture(row: LeagueFixture): LeagueFixture {
  return {
    ...row,
    stage: row.stage ?? "group",
    knockout_round: row.knockout_round ?? null,
    bracket_slot: row.bracket_slot ?? null,
  };
}

export function isGroupFixture(fixture: LeagueFixture) {
  return (fixture.stage ?? "group") === "group";
}

export function isKnockoutFixture(fixture: LeagueFixture) {
  return fixture.stage === "knockout";
}

export function groupStageFixtures(fixtures: LeagueFixture[]) {
  return fixtures.filter(isGroupFixture);
}

export function knockoutFixtures(fixtures: LeagueFixture[]) {
  return fixtures.filter(isKnockoutFixture).sort((a, b) => {
    const round = Number(a.knockout_round === "final") - Number(b.knockout_round === "final");
    if (round !== 0) return round;
    return (a.bracket_slot ?? 0) - (b.bracket_slot ?? 0);
  });
}

export function groupLabel(label: string) {
  return `Gruppe ${label}`;
}

export function fixtureRoundLabel(fixture: LeagueFixture, index: number) {
  if (fixture.knockout_round === "final") return "Finale";
  if (fixture.knockout_round === "semi") {
    return fixture.bracket_slot === 2 ? "Semifinale 2" : "Semifinale 1";
  }
  return `Kamp ${index}`;
}

export function finalsQualifyCopy(groupCount: number) {
  if (groupCount <= 2) return "Top 2 fra gruppe A og B spiller semifinaler og finale.";
  if (groupCount === 3) {
    return "De 3 gruppevindere og den bedste 2’er spiller semifinaler og finale.";
  }
  return "De 4 gruppevindere spiller semifinaler og finale.";
}

export function formatFinalsWhen(
  league: Pick<League, "finals_on" | "finals_starts_at" | "finals_tba">,
) {
  if (league.finals_tba) return "TBA";
  if (league.finals_starts_at) return formatLeagueWhen(league.finals_starts_at);
  if (league.finals_on) return formatLeagueDay(league.finals_on);
  return null;
}

export function leagueHasFinalsPromo(
  league: Pick<League, "finals_on" | "finals_tba">,
  fixtures: LeagueFixture[],
) {
  return Boolean(
    league.finals_tba ||
      league.finals_on ||
      fixtures.some((row) => row.stage === "knockout"),
  );
}

const LEAGUE_SELECT =
  "id, name, starts_on, ends_on, signup_deadline, created_at, group_count, finals_on, finals_starts_at, finals_venue, finals_note, finals_tba";

export async function fetchLatestLeague() {
  const { data, error } = await supabase
    .from("leagues")
    .select(LEAGUE_SELECT)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as League;
  return {
    ...row,
    group_count: row.group_count ?? 2,
    finals_on: row.finals_on ?? null,
    finals_starts_at: row.finals_starts_at ?? null,
    finals_venue: row.finals_venue ?? null,
    finals_note: row.finals_note ?? null,
    finals_tba: Boolean(row.finals_tba),
  };
}
