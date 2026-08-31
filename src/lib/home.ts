import {
  fetchLatestLeague,
  fixtureHasUnread,
  type LeagueFixture,
  type LeagueTeamPlayer,
} from "./league";
import {
  MATCH_SELECT,
  type MatchCard,
  type MatchPlayer,
  type MatchRow,
  type MatchSet,
} from "./match";
import { fetchUnreadNotificationCount } from "./matchmaker";
import { supabase } from "./supabase";

export type HomeDashboard = {
  firstName: string | null;
  unreadDialogs: number;
  nextMatch: MatchCard | null;
  nextMatchIsOwn: boolean;
  remainingLeagueMatches: number | null;
  inLeague: boolean;
  signupOpen: boolean;
  leagueInvites: number;
  unreadNotifications: number;
};

export function remainingLeagueCopy(count: number) {
  if (count === 0) return "I mangler ingen ligakampe";
  if (count === 1) return "I mangler 1 ligakamp";
  return `I mangler ${count} ligakampe`;
}

async function fetchMatchCard(matchId: string): Promise<MatchCard | null> {
  const [{ data: match }, { data: playerRows }, { data: setRows }] =
    await Promise.all([
      supabase
        .from("matches")
        .select(MATCH_SELECT)
        .eq("id", matchId)
        .maybeSingle(),
      supabase.from("match_players").select("*").eq("match_id", matchId),
      supabase.from("match_sets").select("*").eq("match_id", matchId),
    ]);
  if (!match) return null;
  return {
    ...(match as MatchRow),
    players: (playerRows ?? []) as MatchPlayer[],
    sets: (setRows ?? []) as MatchSet[],
  };
}

async function fetchNextScheduledMatch(userId: string) {
  const { data: appearances, error: appearanceError } = await supabase
    .from("match_players")
    .select("match_id")
    .eq("profile_id", userId);
  if (appearanceError) throw appearanceError;

  const ownIds = [...new Set((appearances ?? []).map((row) => row.match_id))];
  if (ownIds.length > 0) {
    const { data: ownUpcoming, error: ownError } = await supabase
      .from("matches")
      .select("id")
      .eq("status", "scheduled")
      .in("id", ownIds)
      .order("played_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (ownError) throw ownError;
    if (ownUpcoming) {
      return { match: await fetchMatchCard(ownUpcoming.id), isOwn: true };
    }
  }

  const { data: clubUpcoming, error: clubError } = await supabase
    .from("matches")
    .select("id")
    .eq("status", "scheduled")
    .order("played_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (clubError) throw clubError;
  if (!clubUpcoming) return { match: null, isOwn: false };

  const match = await fetchMatchCard(clubUpcoming.id);
  return {
    match,
    isOwn: Boolean(
      match?.players.some((player) => player.profile_id === userId),
    ),
  };
}

function fixtureIsDone(
  fixture: LeagueFixture,
  matchStatus: Map<string, "scheduled" | "played">,
  setsByMatch: Map<string, MatchSet[]>,
) {
  if (!fixture.match_id) return false;
  if (matchStatus.get(fixture.match_id) !== "played") return false;
  return (setsByMatch.get(fixture.match_id) ?? []).length > 0;
}

export async function fetchHomeDashboard(
  userId: string,
): Promise<HomeDashboard> {
  const [{ data: profile }, next, league, unreadNotifications] =
    await Promise.all([
    supabase.from("profiles").select("first_name").eq("id", userId).maybeSingle(),
    fetchNextScheduledMatch(userId),
    fetchLatestLeague(),
    fetchUnreadNotificationCount(),
  ]);

  const empty: HomeDashboard = {
    firstName: profile?.first_name ?? null,
    unreadDialogs: 0,
    nextMatch: next.match,
    nextMatchIsOwn: next.isOwn,
    remainingLeagueMatches: null,
    inLeague: false,
    signupOpen: false,
    leagueInvites: 0,
    unreadNotifications,
  };

  if (!league) return empty;

  const signupOpen =
    new Date(league.signup_deadline).getTime() >= Date.now();

  const [{ data: rosterRows }, { data: fixtureRows }] = await Promise.all([
    supabase
      .from("league_team_players")
      .select("team_id, profile_id")
      .eq("league_id", league.id),
    supabase.from("league_fixtures").select("*").eq("league_id", league.id),
  ]);

  const roster = (rosterRows ?? []) as Pick<
    LeagueTeamPlayer,
    "team_id" | "profile_id"
  >[];
  const myTeamId = roster.find((row) => row.profile_id === userId)?.team_id;
  if (!myTeamId) {
    const { data: inviteRows } = await supabase
      .from("league_join_requests")
      .select("id")
      .eq("league_id", league.id)
      .eq("recipient_id", userId);
    return {
      ...empty,
      signupOpen,
      leagueInvites: inviteRows?.length ?? 0,
    };
  }

  const fixtures = (fixtureRows ?? []) as LeagueFixture[];
  const myFixtures = fixtures.filter(
    (row) => row.team_a_id === myTeamId || row.team_b_id === myTeamId,
  );

  const matchIds = myFixtures
    .map((row) => row.match_id)
    .filter((id): id is string => Boolean(id));

  const matchStatus = new Map<string, "scheduled" | "played">();
  const setsByMatch = new Map<string, MatchSet[]>();
  if (matchIds.length > 0) {
    const [{ data: matchRows }, { data: setRows }] = await Promise.all([
      supabase.from("matches").select("id, status").in("id", matchIds),
      supabase.from("match_sets").select("*").in("match_id", matchIds),
    ]);
    for (const row of (matchRows ?? []) as Pick<MatchRow, "id" | "status">[]) {
      matchStatus.set(row.id, row.status);
    }
    for (const row of (setRows ?? []) as MatchSet[]) {
      const list = setsByMatch.get(row.match_id) ?? [];
      list.push(row);
      setsByMatch.set(row.match_id, list);
    }
  }

  const remainingLeagueMatches = myFixtures.filter(
    (fixture) => !fixtureIsDone(fixture, matchStatus, setsByMatch),
  ).length;

  let unreadDialogs = 0;
  if (myFixtures.length > 0) {
    const ids = myFixtures.map((row) => row.id);
    const [{ data: messageRows }, { data: readRows }] = await Promise.all([
      supabase
        .from("league_fixture_messages")
        .select("fixture_id, author_id, created_at")
        .in("fixture_id", ids),
      supabase
        .from("league_fixture_reads")
        .select("fixture_id, last_read_at")
        .eq("profile_id", userId)
        .in("fixture_id", ids),
    ]);
    const lastOther = new Map<string, string>();
    for (const row of messageRows ?? []) {
      if (row.author_id === userId) continue;
      const previous = lastOther.get(row.fixture_id);
      if (!previous || row.created_at > previous) {
        lastOther.set(row.fixture_id, row.created_at);
      }
    }
    const lastRead = new Map(
      (readRows ?? []).map((row) => [row.fixture_id, row.last_read_at]),
    );
    unreadDialogs = ids.filter((id) =>
      fixtureHasUnread(lastOther.get(id), lastRead.get(id)),
    ).length;
  }

  return {
    firstName: profile?.first_name ?? null,
    unreadDialogs,
    nextMatch: next.match,
    nextMatchIsOwn: next.isOwn,
    remainingLeagueMatches,
    inLeague: true,
    signupOpen,
    leagueInvites: 0,
    unreadNotifications,
  };
}
