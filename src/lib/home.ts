import {
  asLeagueFixture,
  fetchLatestLeague,
  fixtureHasUnread,
  groupStageFixtures,
  leagueStandings,
  leagueStandingsWindow,
  type League,
  type LeagueFixture,
  type LeagueTeam,
  type LeagueTeamPlayer,
} from "./league";
import {
  asMatchRow,
  fetchDisputedMatchIds,
  withMatchSelect,
  type MatchCard,
  type MatchPlayer,
  type MatchRow,
  type MatchSet,
} from "./match";
import { fetchUnreadNotificationCount } from "./matchmaker";
import { fetchUnreadDirectCount } from "./messages";
import { fetchPendingPoll, type PendingPoll } from "./poll";
import { fetchMembersByIds, type PartnerPreview } from "./profile";
import { supabase } from "./supabase";

export type HomeLeagueTableRow = {
  place: number;
  teamId: string;
  points: number;
  mine: boolean;
  players: PartnerPreview[];
};

export type HomeDashboard = {
  firstName: string | null;
  unreadDialogs: number;
  nextMatch: MatchCard | null;
  nextMatchIsOwn: boolean;
  nextMatchPeople: Map<string, PartnerPreview>;
  remainingLeagueMatches: number | null;
  leaguePlace: number | null;
  leaguePoints: number | null;
  leagueTable: HomeLeagueTableRow[];
  leaguePlayed: number | null;
  leagueTotal: number | null;
  inLeague: boolean;
  signupOpen: boolean;
  leagueInvites: number;
  unreadNotifications: number;
  unreadMessages: number;
  hasPartner: boolean;
  pendingPoll: PendingPoll | null;
  myGroupLabel: string | null;
  groupCount: number;
  finalsOn: string | null;
  finalsStartsAt: string | null;
  finalsVenue: string | null;
  finalsNote: string | null;
  leagueFixtures: LeagueFixture[];
  leagueTeams: LeagueTeam[];
  currentLeague: League | null;
};

export function remainingLeagueCopy(count: number) {
  if (count === 0) return "I mangler ingen ligakampe";
  if (count === 1) return "I mangler 1 ligakamp";
  return `I mangler ${count} ligakampe`;
}

async function fetchMatchCard(matchId: string): Promise<MatchCard | null> {
  const [{ data: match }, { data: playerRows }, { data: setRows }] =
    await Promise.all([
      withMatchSelect((select) =>
        supabase.from("matches").select(select).eq("id", matchId).maybeSingle(),
      ),
      supabase.from("match_players").select("*").eq("match_id", matchId),
      supabase.from("match_sets").select("*").eq("match_id", matchId),
    ]);
  if (!match) return null;
  return {
    ...asMatchRow(match as MatchRow),
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
  const [
    { data: profile },
    next,
    league,
    unreadNotifications,
    unreadMessages,
    pendingPoll,
  ] =
    await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, partner_id")
      .eq("id", userId)
      .maybeSingle(),
    fetchNextScheduledMatch(userId),
    fetchLatestLeague(),
    fetchUnreadNotificationCount(),
    fetchUnreadDirectCount(),
    fetchPendingPoll(),
  ]);

  const nextMatchPeoplePromise = fetchMembersByIds(
    (next.match?.players ?? []).map((player) => player.profile_id),
  );

  const empty = (nextMatchPeople: Map<string, PartnerPreview>): HomeDashboard => ({
    firstName: profile?.first_name ?? null,
    unreadDialogs: 0,
    nextMatch: next.match,
    nextMatchIsOwn: next.isOwn,
    nextMatchPeople,
    remainingLeagueMatches: null,
    leaguePlace: null,
    leaguePoints: null,
    leagueTable: [],
    leaguePlayed: null,
    leagueTotal: null,
    inLeague: false,
    signupOpen: false,
    leagueInvites: 0,
    unreadNotifications,
    unreadMessages,
    hasPartner: Boolean(profile?.partner_id),
    pendingPoll,
    myGroupLabel: null,
    groupCount: 2,
    finalsOn: null,
    finalsStartsAt: null,
    finalsVenue: null,
    finalsNote: null,
    leagueFixtures: [],
    leagueTeams: [],
    currentLeague: null,
  });

  if (!league) return empty(await nextMatchPeoplePromise);

  const signupOpen =
    new Date(league.signup_deadline).getTime() >= Date.now();

  const [{ data: rosterRows }, { data: teamRows }, { data: fixtureRows }, { data: groupRows }, nextMatchPeople] =
    await Promise.all([
      supabase
        .from("league_team_players")
        .select("team_id, profile_id, slot")
        .eq("league_id", league.id),
      supabase
        .from("league_teams")
        .select("id, league_id, created_at, created_by, group_id")
        .eq("league_id", league.id),
      supabase.from("league_fixtures").select("*").eq("league_id", league.id),
      supabase
        .from("league_groups")
        .select("id, label")
        .eq("league_id", league.id),
      nextMatchPeoplePromise,
    ]);

  const roster = (rosterRows ?? []) as Pick<
    LeagueTeamPlayer,
    "team_id" | "profile_id" | "slot"
  >[];
  const myTeamId = roster.find((row) => row.profile_id === userId)?.team_id;
  if (!myTeamId) {
    const { data: inviteRows } = await supabase
      .from("league_join_requests")
      .select("id")
      .eq("league_id", league.id)
      .eq("recipient_id", userId);
    return {
      ...empty(nextMatchPeople),
      signupOpen,
      leagueInvites: inviteRows?.length ?? 0,
      currentLeague: league,
      groupCount: league.group_count ?? 2,
      finalsOn: league.finals_on,
      finalsStartsAt: league.finals_starts_at,
      finalsVenue: league.finals_venue,
      finalsNote: league.finals_note,
      leagueFixtures: ((fixtureRows ?? []) as LeagueFixture[]).map(
        asLeagueFixture,
      ),
    };
  }

  const fixtures = ((fixtureRows ?? []) as LeagueFixture[]).map(asLeagueFixture);
  const myFixtures = fixtures.filter(
    (row) => row.team_a_id === myTeamId || row.team_b_id === myTeamId,
  );

  const matchIds = fixtures
    .map((row) => row.match_id)
    .filter((id): id is string => Boolean(id));

  const matchStatus = new Map<string, "scheduled" | "played">();
  const setsByMatch = new Map<string, MatchSet[]>();
  let matchPlayers: MatchPlayer[] = [];
  let disputedMatchIds = new Set<string>();
  const matchLoad =
    matchIds.length > 0
      ? Promise.all([
          supabase.from("matches").select("id, status").in("id", matchIds),
          supabase.from("match_players").select("*").in("match_id", matchIds),
          supabase.from("match_sets").select("*").in("match_id", matchIds),
          fetchDisputedMatchIds(matchIds),
        ])
      : Promise.resolve(null);
  const [matchBundle, people] = await Promise.all([
    matchLoad,
    fetchMembersByIds(roster.map((row) => row.profile_id)),
  ]);
  if (matchBundle) {
    const [{ data: matchRows }, { data: playerRows }, { data: setRows }, disputed] =
      matchBundle;
    for (const row of (matchRows ?? []) as Pick<MatchRow, "id" | "status">[]) {
      matchStatus.set(row.id, row.status);
    }
    matchPlayers = (playerRows ?? []) as MatchPlayer[];
    for (const row of (setRows ?? []) as MatchSet[]) {
      const list = setsByMatch.get(row.match_id) ?? [];
      list.push(row);
      setsByMatch.set(row.match_id, list);
    }
    disputedMatchIds = disputed;
  }

  const groupById = new Map(
    ((groupRows ?? []) as { id: string; label: string }[]).map((row) => [
      row.id,
      row.label,
    ]),
  );
  const teamGroup = new Map(
    (
      (teamRows ?? []) as {
        id: string;
        group_id: string | null;
      }[]
    ).map((row) => [row.id, row.group_id]),
  );
  const teams: LeagueTeam[] = [...new Set(roster.map((row) => row.team_id))].map(
    (teamId) => ({
      id: teamId,
      league_id: league.id,
      created_at: "",
      created_by: null,
      group_id: teamGroup.get(teamId) ?? null,
      players: roster
        .filter((row) => row.team_id === teamId)
        .sort((a, b) => a.slot - b.slot)
        .map((row) => people.get(row.profile_id))
        .filter((person): person is PartnerPreview => Boolean(person)),
    }),
  );
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const myGroupId = teamsById.get(myTeamId)?.group_id ?? null;
  const groupTeams = myGroupId
    ? teams.filter((team) => team.group_id === myGroupId)
    : teams.filter((team) => team.id === myTeamId);
  const standings = leagueStandings(
    groupTeams,
    fixtures,
    matchPlayers,
    setsByMatch,
    matchStatus,
    disputedMatchIds,
  );
  const standingIndex = standings.findIndex((row) => row.teamId === myTeamId);
  const leaguePlace = standingIndex >= 0 ? standingIndex + 1 : null;
  const leaguePoints =
    standingIndex >= 0 ? standings[standingIndex].points : null;
  const window = leagueStandingsWindow(standings, myTeamId);
  const leagueTable = window.rows.map((row, offset) => ({
    place: window.start + offset + 1,
    teamId: row.teamId,
    points: row.points,
    mine: row.teamId === myTeamId,
    players: teamsById.get(row.teamId)?.players ?? [],
  }));

  const myGroupFixtures = myGroupId
    ? groupStageFixtures(myFixtures).filter((fixture) => {
        const otherId =
          fixture.team_a_id === myTeamId ? fixture.team_b_id : fixture.team_a_id;
        return teamGroup.get(otherId) === myGroupId;
      })
    : [];
  const remainingLeagueMatches = myGroupFixtures.filter(
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
    nextMatchPeople,
    remainingLeagueMatches,
    leaguePlace,
    leaguePoints,
    leagueTable,
    leaguePlayed: myGroupFixtures.length - remainingLeagueMatches,
    leagueTotal: myGroupFixtures.length,
    inLeague: true,
    signupOpen,
    leagueInvites: 0,
    unreadNotifications,
    unreadMessages,
    hasPartner: Boolean(profile?.partner_id),
    pendingPoll,
    myGroupLabel: myGroupId ? groupById.get(myGroupId) ?? null : null,
    groupCount: league.group_count ?? 2,
    finalsOn: league.finals_on,
    finalsStartsAt: league.finals_starts_at,
    finalsVenue: league.finals_venue,
    finalsNote: league.finals_note,
    leagueFixtures: fixtures,
    leagueTeams: teams,
    currentLeague: league,
  };
}
