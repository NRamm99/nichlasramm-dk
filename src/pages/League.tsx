import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { LeaguePlace } from "../components/LeaguePlace";
import { MemberAvatar, MemberNameLink } from "../components/MemberAvatar";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  fetchLatestLeague,
  fixtureHasUnread,
  formatLeagueDay,
  formatLeagueWhen,
  leagueIsRunning,
  leagueStandings,
  messageAuthorName,
  teamName,
  type League,
  type LeagueFixture,
  type LeagueJoinRequest,
  type LeagueMessage,
  type LeagueTeam,
  type LeagueTeamPlayer,
} from "../lib/league";
import {
  formatMatchWhen,
  toDatetimeLocalValue,
  type MatchPlayer,
  type MatchRow,
  type MatchSet,
} from "../lib/match";
import {
  fetchMembersByIds,
  fullName,
  type PartnerPreview,
} from "../lib/profile";
import { supabase } from "../lib/supabase";

export function League() {
  const { user, loading, isAdmin } = useAuth();
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<LeagueTeam[]>([]);
  const [fixtures, setFixtures] = useState<LeagueFixture[]>([]);
  const [players, setPlayers] = useState<MatchPlayer[]>([]);
  const [setsByMatch, setSetsByMatch] = useState<Map<string, MatchSet[]>>(
    new Map(),
  );
  const [matchStatus, setMatchStatus] = useState<
    Map<string, "scheduled" | "played">
  >(new Map());
  const [members, setMembers] = useState<PartnerPreview[]>([]);
  const [clubPartnerId, setClubPartnerId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState("Liga");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [deadline, setDeadline] = useState("");
  const [unreadFixtures, setUnreadFixtures] = useState<Set<string>>(new Set());
  const [disputedMatchIds, setDisputedMatchIds] = useState<Set<string>>(
    new Set(),
  );
  const [editingSeason, setEditingSeason] = useState(false);
  const [creatingNext, setCreatingNext] = useState(false);
  const [removingTeamId, setRemovingTeamId] = useState<string | null>(null);
  const [joinRequests, setJoinRequests] = useState<LeagueJoinRequest[]>([]);

  function fillSeasonFromLeague(current: League) {
    setName(current.name);
    setStartsOn(current.starts_on.slice(0, 10));
    setEndsOn(current.ends_on.slice(0, 10));
    setDeadline(toDatetimeLocalValue(new Date(current.signup_deadline)));
  }

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    const latest = await fetchLatestLeague().catch((loadError: Error) => {
      setError(danishAuthError(loadError.message));
      return null;
    });
    setLeague(latest);

    const [{ data: memberRows }, { data: me }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, first_name, last_name, avatar_url")
        .is("banned_at", null)
        .order("first_name"),
      supabase.from("profiles").select("partner_id").eq("id", user.id).maybeSingle(),
    ]);
    const people = ((memberRows ?? []) as PartnerPreview[]).filter(
      (row) => row.id !== user.id,
    );
    setMembers(people);
    setClubPartnerId(me?.partner_id ?? null);
    setPartnerId((current) => current || me?.partner_id || "");

    if (!latest) {
      setTeams([]);
      setFixtures([]);
      setJoinRequests([]);
      setUnreadFixtures(new Set());
      setReady(true);
      return;
    }

    const [{ data: teamRows }, { data: rosterRows }, { data: fixtureRows }, { data: requestRows }] =
      await Promise.all([
        supabase.from("league_teams").select("*").eq("league_id", latest.id),
        supabase
          .from("league_team_players")
          .select("*")
          .eq("league_id", latest.id),
        supabase.from("league_fixtures").select("*").eq("league_id", latest.id),
        supabase
          .from("league_join_requests")
          .select("id, league_id, requester_id, recipient_id, created_at")
          .eq("league_id", latest.id),
      ]);

    const roster = (rosterRows ?? []) as LeagueTeamPlayer[];
    const pendingRequests = (requestRows ?? []) as Omit<
      LeagueJoinRequest,
      "other"
    >[];
    const peopleById = await fetchMembersByIds([
      ...roster.map((row) => row.profile_id),
      ...pendingRequests.flatMap((row) => [row.requester_id, row.recipient_id]),
    ]);
    setJoinRequests(
      pendingRequests.map((row) => ({
        ...row,
        other:
          peopleById.get(
            row.requester_id === user.id ? row.recipient_id : row.requester_id,
          ) ?? null,
      })),
    );
    const mappedTeams: LeagueTeam[] = ((teamRows ?? []) as Omit<
      LeagueTeam,
      "players"
    >[]).map((team) => ({
      ...team,
      players: roster
        .filter((row) => row.team_id === team.id)
        .sort((a, b) => a.slot - b.slot)
        .map((row) => peopleById.get(row.profile_id))
        .filter((person): person is PartnerPreview => Boolean(person)),
    }));
    setTeams(mappedTeams);

    const mappedFixtures = (fixtureRows ?? []) as LeagueFixture[];
    setFixtures(mappedFixtures);

    const matchIds = mappedFixtures
      .map((row) => row.match_id)
      .filter((id): id is string => Boolean(id));
    if (matchIds.length > 0) {
      const [
        { data: matchRows },
        { data: playerRows },
        { data: setRows },
        { data: correctionRows },
      ] = await Promise.all([
        supabase.from("matches").select("id, status").in("id", matchIds),
        supabase.from("match_players").select("*").in("match_id", matchIds),
        supabase.from("match_sets").select("*").in("match_id", matchIds),
        supabase
          .from("match_result_corrections")
          .select("match_id")
          .in("match_id", matchIds),
      ]);
      setPlayers((playerRows ?? []) as MatchPlayer[]);
      const status = new Map<string, "scheduled" | "played">();
      for (const row of (matchRows ?? []) as Pick<MatchRow, "id" | "status">[]) {
        status.set(row.id, row.status);
      }
      setMatchStatus(status);
      const sets = new Map<string, MatchSet[]>();
      for (const row of (setRows ?? []) as MatchSet[]) {
        const list = sets.get(row.match_id) ?? [];
        list.push(row);
        sets.set(row.match_id, list);
      }
      setSetsByMatch(sets);
      setDisputedMatchIds(
        new Set((correctionRows ?? []).map((row) => row.match_id as string)),
      );
    } else {
      setPlayers([]);
      setMatchStatus(new Map());
      setSetsByMatch(new Map());
      setDisputedMatchIds(new Set());
    }

    const myTeamIds = new Set(
      mappedTeams
        .filter((team) => team.players.some((player) => player.id === user.id))
        .map((team) => team.id),
    );
    const myFixtureIds = mappedFixtures
      .filter(
        (row) => myTeamIds.has(row.team_a_id) || myTeamIds.has(row.team_b_id),
      )
      .map((row) => row.id);

    if (myFixtureIds.length === 0) {
      setUnreadFixtures(new Set());
    } else {
      const [{ data: messageRows }, { data: readRows }] = await Promise.all([
        supabase
          .from("league_fixture_messages")
          .select("fixture_id, author_id, created_at")
          .in("fixture_id", myFixtureIds),
        supabase
          .from("league_fixture_reads")
          .select("fixture_id, last_read_at")
          .eq("profile_id", user.id)
          .in("fixture_id", myFixtureIds),
      ]);
      const lastOther = new Map<string, string>();
      for (const row of messageRows ?? []) {
        if (row.author_id === user.id) continue;
        const previous = lastOther.get(row.fixture_id);
        if (!previous || row.created_at > previous) {
          lastOther.set(row.fixture_id, row.created_at);
        }
      }
      const lastRead = new Map(
        (readRows ?? []).map((row) => [row.fixture_id, row.last_read_at]),
      );
      const unread = new Set<string>();
      for (const id of myFixtureIds) {
        if (fixtureHasUnread(lastOther.get(id), lastRead.get(id))) {
          unread.add(id);
        }
      }
      setUnreadFixtures(unread);
    }

    setReady(true);
  }, [user]);

  useEffect(() => {
    if (!loading && user) void load();
  }, [load, loading, user]);

  if (loading || (!ready && user)) {
    return (
      <SiteShell>
        <main className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center px-6 text-sm text-line/60">
          Indlæser…
        </main>
      </SiteShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const myTeam = teams.find((team) =>
    team.players.some((player) => player.id === user.id),
  );
  const signupOpen = Boolean(
    league && new Date(league.signup_deadline).getTime() >= Date.now(),
  );
  const incomingJoins = joinRequests.filter(
    (request) => request.recipient_id === user.id,
  );
  const outgoingJoin = joinRequests.find(
    (request) => request.requester_id === user.id,
  );
  const seasonRunning = Boolean(league && leagueIsRunning(league));
  const standings = league
    ? leagueStandings(
        teams,
        fixtures,
        players,
        setsByMatch,
        matchStatus,
        disputedMatchIds,
      )
    : [];
  const myFixtures = fixtures
    .filter(
      (row) =>
        myTeam &&
        (row.team_a_id === myTeam.id || row.team_b_id === myTeam.id),
    )
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const { error: createError } = await supabase.rpc("create_league", {
      p_name: name,
      p_starts_on: startsOn,
      p_ends_on: endsOn,
      p_signup_deadline: new Date(deadline).toISOString(),
    });
    setSaving(false);
    if (createError) {
      setError(danishAuthError(createError.message));
      return;
    }
    setInfo("Ligaen er oprettet.");
    setCreatingNext(false);
    setEditingSeason(false);
    await load();
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!league) return;
    setError(null);
    setSaving(true);
    const { error: updateError } = await supabase.rpc("update_league", {
      p_league_id: league.id,
      p_name: name,
      p_starts_on: startsOn,
      p_ends_on: endsOn,
      p_signup_deadline: new Date(deadline).toISOString(),
    });
    setSaving(false);
    if (updateError) {
      setError(danishAuthError(updateError.message));
      return;
    }
    setInfo("Sæsonen er opdateret.");
    setEditingSeason(false);
    await load();
  }

  async function handleCloseSignup() {
    if (!league) return;
    if (
      !window.confirm(
        "Luk tilmelding nu? Hold kan ikke tilmelde sig bagefter, medmindre du ændrer fristen.",
      )
    ) {
      return;
    }
    setError(null);
    setSaving(true);
    const { error: closeError } = await supabase.rpc("close_league_signup", {
      p_league_id: league.id,
    });
    setSaving(false);
    if (closeError) {
      setError(danishAuthError(closeError.message));
      return;
    }
    setInfo("Tilmeldingen er lukket.");
    await load();
  }

  async function handleRemoveTeam(team: LeagueTeam) {
    const played = fixtures.filter(
      (row) =>
        (row.team_a_id === team.id || row.team_b_id === team.id) &&
        row.match_id,
    ).length;
    const label = teamName(team.players);
    const ok = window.confirm(
      played > 0
        ? `${label} har ${played} spillede ligakampe. Holdet fjernes, og de kampe bliver almindelige klubkampe. Fortsæt?`
        : `Fjern ${label} fra ligaen?`,
    );
    if (!ok) return;
    setError(null);
    setRemovingTeamId(team.id);
    const { error: removeError } = await supabase.rpc("remove_league_team", {
      p_team_id: team.id,
    });
    setRemovingTeamId(null);
    if (removeError) {
      setError(danishAuthError(removeError.message));
      return;
    }
    setInfo(`${label} er fjernet fra ligaen.`);
    await load();
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!league) return;
    setError(null);
    setJoining(true);
    const { error: joinError } = await supabase.rpc("request_league_join", {
      p_league_id: league.id,
      p_partner_id: partnerId,
    });
    setJoining(false);
    if (joinError) {
      setError(danishAuthError(joinError.message));
      return;
    }
    setInfo("Anmodning sendt. Makkeren skal acceptere, før I er tilmeldt.");
    await load();
  }

  async function handleAcceptJoin(requestId: string) {
    setError(null);
    setInfo(null);
    const { error: acceptError } = await supabase.rpc("accept_league_join", {
      p_request_id: requestId,
    });
    if (acceptError) {
      setError(danishAuthError(acceptError.message));
      return;
    }
    setInfo("I er tilmeldt ligaen.");
    await load();
  }

  async function handleDeclineJoin(requestId: string) {
    setError(null);
    setInfo(null);
    const { error: declineError } = await supabase.rpc("decline_league_join", {
      p_request_id: requestId,
    });
    if (declineError) {
      setError(danishAuthError(declineError.message));
      return;
    }
    setInfo("Anmodningen er afvist.");
    await load();
  }

  async function handleCancelJoin(requestId: string) {
    setError(null);
    setInfo(null);
    const { error: cancelError } = await supabase.rpc("cancel_league_join", {
      p_request_id: requestId,
    });
    if (cancelError) {
      setError(danishAuthError(cancelError.message));
      return;
    }
    setInfo("Anmodningen er trukket tilbage.");
    await load();
  }

  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-6 pb-16">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
          Sæson
        </p>
        <h1 className="mt-2 font-display text-6xl tracking-wide">
          {league?.name ?? "Liga"}
        </h1>
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-4 text-sm text-ball" role="status">
            {info}
          </p>
        ) : null}

        {isAdmin && !league ? (
          <form
            onSubmit={(event) => void handleCreate(event)}
            className="mt-8 space-y-4 rounded-3xl border border-line/10 bg-court-mid p-6"
          >
            <h2 className="font-display text-3xl tracking-wide">Opret liga</h2>
            <label className="block text-sm">
              Navn
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
              />
            </label>
            <label className="block text-sm">
              Start
              <input
                type="date"
                required
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
              />
            </label>
            <label className="block text-sm">
              Slut
              <input
                type="date"
                required
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
              />
            </label>
            <label className="block text-sm">
              Tilmeldelsesfrist
              <input
                type="datetime-local"
                required
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-ball px-5 py-2 text-sm font-semibold text-court disabled:opacity-60"
            >
              {saving ? "Opretter…" : "Opret liga"}
            </button>
          </form>
        ) : null}

        {league ? (
          <>
            <section className="mt-8 rounded-3xl border border-line/10 bg-court-mid p-6">
              <p className="text-sm text-line/70">
                {formatLeagueDay(league.starts_on)} –{" "}
                {formatLeagueDay(league.ends_on)}
              </p>
              <p className="mt-1 text-sm text-line/55">
                Tilmelding senest {formatLeagueWhen(league.signup_deadline)}
                {signupOpen ? " · åben" : " · lukket"}
              </p>
              <p className="mt-4 text-sm text-line/75">
                3 point for sejr, 1 for uafgjort, 0 for nederlag. Inden sæsonens
                slut skal I have spillet én ligakamp mod hvert andet hold. I
                finder selv dato og skriver sammen i kamp-dialogerne.
              </p>
              <Link
                to="/liga/kampe"
                className="mt-5 flex w-full items-center justify-center rounded-full bg-ball px-4 py-2.5 text-xs font-semibold text-court"
              >
                Se kampe
              </Link>
            </section>

            {isAdmin ? (
              <section className="mt-8 space-y-4 rounded-3xl border border-line/10 bg-court-mid p-6">
                <h2 className="font-display text-3xl tracking-wide">
                  Liga-admin
                </h2>
                <p className="text-sm text-line/60">
                  Ret datoer, luk tilmelding eller fjern et hold, der tilmeldte
                  forkert.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      fillSeasonFromLeague(league);
                      setCreatingNext(false);
                      setEditingSeason((open) => !open);
                    }}
                    className="rounded-full border border-line/20 px-4 py-2 text-sm font-semibold"
                  >
                    {editingSeason ? "Annuller" : "Ret sæson"}
                  </button>
                  {signupOpen ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleCloseSignup()}
                      className="rounded-full border border-line/20 px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      Luk tilmelding
                    </button>
                  ) : null}
                  {!seasonRunning ? (
                    <button
                      type="button"
                      onClick={() => {
                        setName("Liga");
                        setStartsOn("");
                        setEndsOn("");
                        setDeadline("");
                        setEditingSeason(false);
                        setCreatingNext((open) => !open);
                      }}
                      className="rounded-full border border-line/20 px-4 py-2 text-sm font-semibold"
                    >
                      {creatingNext ? "Annuller" : "Ny sæson"}
                    </button>
                  ) : null}
                </div>

                {editingSeason ? (
                  <form
                    onSubmit={(event) => void handleUpdate(event)}
                    className="space-y-4 border-t border-line/10 pt-4"
                  >
                    <label className="block text-sm">
                      Navn
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        Start
                        <input
                          type="date"
                          required
                          value={startsOn}
                          onChange={(event) => setStartsOn(event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
                        />
                      </label>
                      <label className="block text-sm">
                        Slut
                        <input
                          type="date"
                          required
                          value={endsOn}
                          onChange={(event) => setEndsOn(event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
                        />
                      </label>
                    </div>
                    <label className="block text-sm">
                      Tilmeldelsesfrist
                      <input
                        type="datetime-local"
                        required
                        value={deadline}
                        onChange={(event) => setDeadline(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-full bg-ball px-5 py-2 text-sm font-semibold text-court disabled:opacity-60"
                    >
                      {saving ? "Gemmer…" : "Gem ændringer"}
                    </button>
                  </form>
                ) : null}

                {creatingNext ? (
                  <form
                    onSubmit={(event) => void handleCreate(event)}
                    className="space-y-4 border-t border-line/10 pt-4"
                  >
                    <h3 className="text-sm font-semibold">Ny sæson</h3>
                    <p className="text-sm text-line/60">
                      Opretter en ny liga. Den vises som den aktuelle.
                    </p>
                    <label className="block text-sm">
                      Navn
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        Start
                        <input
                          type="date"
                          required
                          value={startsOn}
                          onChange={(event) => setStartsOn(event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
                        />
                      </label>
                      <label className="block text-sm">
                        Slut
                        <input
                          type="date"
                          required
                          value={endsOn}
                          onChange={(event) => setEndsOn(event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
                        />
                      </label>
                    </div>
                    <label className="block text-sm">
                      Tilmeldelsesfrist
                      <input
                        type="datetime-local"
                        required
                        value={deadline}
                        onChange={(event) => setDeadline(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-full bg-ball px-5 py-2 text-sm font-semibold text-court disabled:opacity-60"
                    >
                      {saving ? "Opretter…" : "Opret ny liga"}
                    </button>
                  </form>
                ) : null}

                <div className="border-t border-line/10 pt-4">
                  <h3 className="text-sm font-semibold">Hold</h3>
                  {teams.length === 0 ? (
                    <p className="mt-2 text-sm text-line/55">
                      Ingen hold tilmeldt.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {teams.map((team) => (
                        <li
                          key={team.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-line/10 bg-court px-4 py-3"
                        >
                          <span className="text-sm font-semibold">
                            {teamName(team.players)}
                          </span>
                          <button
                            type="button"
                            disabled={removingTeamId === team.id}
                            onClick={() => void handleRemoveTeam(team)}
                            className="shrink-0 text-sm text-red-300/90 hover:text-red-200 disabled:opacity-60"
                          >
                            {removingTeamId === team.id ? "Fjerner…" : "Fjern"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ) : null}

            {!myTeam && signupOpen ? (
              <div className="mt-8 space-y-4">
                {incomingJoins.length > 0 ? (
                  <section className="space-y-3 rounded-3xl border border-ball/30 bg-court-mid p-6">
                    <h2 className="font-display text-3xl tracking-wide">
                      Anmodninger til dig
                    </h2>
                    <p className="text-sm text-line/65">
                      Accepter kun, hvis du vil spille liga med dem.
                    </p>
                    <ul className="space-y-3">
                      {incomingJoins.map((request) => (
                        <li
                          key={request.id}
                          className="flex flex-col gap-3 rounded-2xl border border-line/10 bg-court px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-center gap-3">
                            {request.other ? (
                              <MemberAvatar person={request.other} size="sm" />
                            ) : null}
                            <div>
                              {request.other ? (
                                <MemberNameLink person={request.other} />
                              ) : (
                                <p className="font-semibold">Ukendt</p>
                              )}
                              <p className="text-sm text-line/60">
                                vil tilmelde jer som hold
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleAcceptJoin(request.id)}
                              className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court"
                            >
                              Acceptér
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeclineJoin(request.id)}
                              className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                            >
                              Afvis
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {outgoingJoin ? (
                  <section className="rounded-3xl border border-line/10 bg-court-mid p-6">
                    <h2 className="font-display text-3xl tracking-wide">
                      Afventer svar
                    </h2>
                    <p className="mt-2 text-sm text-line/65">
                      Du har sendt en anmodning til{" "}
                      {outgoingJoin.other
                        ? fullName(outgoingJoin.other)
                        : "makkeren"}
                      . I er først tilmeldt, når de accepterer.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCancelJoin(outgoingJoin.id)}
                      className="mt-4 rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                    >
                      Annuller anmodning
                    </button>
                  </section>
                ) : (
                  <form
                    onSubmit={(event) => void handleJoin(event)}
                    className="space-y-4 rounded-3xl border border-line/10 bg-court-mid p-6"
                  >
                    <h2 className="font-display text-3xl tracking-wide">
                      Tilmeld
                    </h2>
                    <p className="text-sm text-line/65">
                      Vælg en makker. De skal acceptere, før holdet oprettes.
                    </p>
                    <label className="block text-sm">
                      Makker
                      <select
                        required
                        value={partnerId}
                        onChange={(event) => setPartnerId(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
                      >
                        <option value="">Vælg makker</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {fullName(member)}
                            {member.id === clubPartnerId
                              ? " (din partner)"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      disabled={joining}
                      className="rounded-full bg-ball px-5 py-2 text-sm font-semibold text-court disabled:opacity-60"
                    >
                      {joining ? "Sender…" : "Send anmodning"}
                    </button>
                  </form>
                )}
              </div>
            ) : null}

            {!myTeam && !signupOpen ? (
              <p className="mt-8 text-sm text-line/60">
                Tilmeldingen er lukket.
              </p>
            ) : null}

            <h2 className="mt-10 font-display text-3xl tracking-wide">Tabel</h2>
            {standings.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-line/10 bg-court-mid px-5 py-4 text-sm text-line/60">
                Ingen hold endnu.
              </p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-2xl border border-line/10 bg-court-mid">
                <table className="w-full text-left text-sm">
                  <thead className="text-[0.65rem] uppercase tracking-[0.16em] text-line/40">
                    <tr>
                      <th className="w-16 px-3 py-3 font-semibold">Plads</th>
                      <th className="px-2 py-3 font-semibold">Hold</th>
                      <th className="px-2 py-3 font-semibold">K</th>
                      <th className="px-2 py-3 font-semibold">V</th>
                      <th className="px-2 py-3 font-semibold">U</th>
                      <th className="px-2 py-3 font-semibold">T</th>
                      <th className="px-4 py-3 text-right font-semibold">P</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row, index) => {
                      const place = index + 1;
                      return (
                        <tr
                          key={row.teamId}
                          className={`border-t border-line/10 ${
                            place === 1
                              ? "bg-ball/[0.07]"
                              : place === 2
                                ? "bg-line/[0.04]"
                                : place === 3
                                  ? "bg-amber-700/15"
                                  : ""
                          }`}
                        >
                          <td className="px-3 py-3">
                            <LeaguePlace place={place} />
                          </td>
                          <td className="px-2 py-3 font-semibold">{row.name}</td>
                          <td className="px-2 py-3 text-line/70">{row.played}</td>
                          <td className="px-2 py-3 text-line/70">{row.wins}</td>
                          <td className="px-2 py-3 text-line/70">{row.draws}</td>
                          <td className="px-2 py-3 text-line/70">{row.losses}</td>
                          <td className="px-4 py-3 text-right font-display text-2xl leading-none text-ball">
                            {row.points}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {myTeam ? (
              <>
                <h2 className="mt-10 font-display text-3xl tracking-wide">
                  Jeres kampe
                </h2>
                <p className="mt-2 text-sm text-line/65">
                  I skal nå én kamp mod hvert hold inden{" "}
                  {formatLeagueDay(league.ends_on)}.
                </p>
                {myFixtures.length === 0 ? (
                  <p className="mt-4 rounded-2xl border border-line/10 bg-court-mid px-5 py-4 text-sm text-line/60">
                    Vent på at flere hold tilmelder sig. Så oprettes
                    kamp-dialogerne automatisk.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {myFixtures.map((fixture, index) => (
                      <FixtureDialog
                        key={fixture.id}
                        index={index + 1}
                        fixture={fixture}
                        myTeamId={myTeam.id}
                        teams={teams}
                        matchStatus={
                          fixture.match_id
                            ? matchStatus.get(fixture.match_id)
                            : undefined
                        }
                        hasResult={
                          Boolean(fixture.match_id) &&
                          matchStatus.get(fixture.match_id ?? "") ===
                            "played" &&
                          (setsByMatch.get(fixture.match_id ?? "") ?? [])
                            .length > 0
                        }
                        userId={user.id}
                        hasUnread={unreadFixtures.has(fixture.id)}
                        hasDispute={Boolean(
                          fixture.match_id &&
                            disputedMatchIds.has(fixture.match_id),
                        )}
                        onRead={(id) => {
                          setUnreadFixtures((current) => {
                            const next = new Set(current);
                            next.delete(id);
                            return next;
                          });
                        }}
                        onSent={() => void load()}
                      />
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </>
        ) : !isAdmin ? (
          <p className="mt-8 text-sm text-line/60">
            Der er ikke oprettet en liga endnu.
          </p>
        ) : null}
      </main>
    </SiteShell>
  );
}

function FixtureDialog({
  index,
  fixture,
  myTeamId,
  teams,
  matchStatus,
  hasResult,
  userId,
  hasUnread,
  hasDispute,
  onRead,
  onSent,
}: {
  index: number;
  fixture: LeagueFixture;
  myTeamId: string;
  teams: LeagueTeam[];
  matchStatus?: "scheduled" | "played";
  hasResult: boolean;
  userId: string;
  hasUnread: boolean;
  hasDispute: boolean;
  onRead: (fixtureId: string) => void;
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<LeagueMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const opponentId =
    fixture.team_a_id === myTeamId ? fixture.team_b_id : fixture.team_a_id;
  const opponent = teams.find((team) => team.id === opponentId);
  const done = hasResult;

  async function markRead() {
    const { error: readError } = await supabase.rpc(
      "mark_league_fixture_read",
      { p_fixture_id: fixture.id },
    );
    if (!readError) onRead(fixture.id);
  }

  useEffect(() => {
    if (!open) return;
    void supabase
      .from("league_fixture_messages")
      .select("id, fixture_id, author_id, body, created_at")
      .eq("fixture_id", fixture.id)
      .order("created_at")
      .then(({ data }) => {
        setMessages((data ?? []) as LeagueMessage[]);
      });
  }, [fixture.id, open]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const { error: sendError } = await supabase.rpc("add_league_message", {
      p_fixture_id: fixture.id,
      p_body: body,
    });
    setSaving(false);
    if (sendError) {
      setError(danishAuthError(sendError.message));
      return;
    }
    setBody("");
    await markRead();
    onSent();
    const { data } = await supabase
      .from("league_fixture_messages")
      .select("id, fixture_id, author_id, body, created_at")
      .eq("fixture_id", fixture.id)
      .order("created_at");
    setMessages((data ?? []) as LeagueMessage[]);
  }

  return (
    <li
      className={`overflow-hidden rounded-2xl border bg-court-mid ${
        hasUnread ? "border-ball/50" : "border-line/10"
      }`}
    >
      <button
        type="button"
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (next) void markRead();
            return next;
          });
        }}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <p className="flex items-center gap-2 font-display text-2xl tracking-wide">
            Kamp {index}
            {hasUnread ? (
              <span className="rounded-full bg-ball px-2 py-0.5 font-sans text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-court">
                Ny
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-sm text-line/70">
            {opponent ? teamName(opponent.players) : "Modstander"}
          </p>
        </div>
        <p
          className={`text-[0.65rem] font-semibold uppercase tracking-[0.16em] ${
            hasDispute ? "text-amber-200/90" : done ? "text-ball" : "text-line/45"
          }`}
        >
          {hasDispute
            ? "Uenighed"
            : done
              ? "Klaret"
              : matchStatus === "scheduled"
                ? "Planlagt"
                : "Åben"}
        </p>
      </button>
      {open ? (
        <div className="border-t border-line/10 px-5 py-4">
          {!fixture.match_id ? (
            <Link
              to={`/kampe/ny?liga=${fixture.id}`}
              className="inline-flex rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court"
            >
              Opret kamp
            </Link>
          ) : (
            <Link
              to={`/kampe/${fixture.match_id}`}
              className="text-sm font-semibold text-ball"
            >
              {hasDispute
                ? "Løs uenigheden"
                : done
                  ? "Se resultatet"
                  : "Se den planlagte kamp"}
            </Link>
          )}
          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
            {messages.length === 0 ? (
              <li className="text-sm text-line/55">
                Skriv og find en dato med det andet hold.
              </li>
            ) : (
              messages.map((row) => (
                <li
                  key={row.id}
                  className={`rounded-2xl px-3 py-2 text-sm ${
                    row.author_id === userId
                      ? "bg-ball/10 text-line"
                      : "bg-court text-line/80"
                  }`}
                >
                  <p className="text-[0.65rem] text-line/45">
                    {messageAuthorName(teams, row.author_id)}
                    {row.author_id === userId ? " (dig)" : ""} ·{" "}
                    {formatMatchWhen(row.created_at)}
                  </p>
                  <p className="mt-1">{row.body}</p>
                </li>
              ))
            )}
          </ul>
          <form onSubmit={(event) => void handleSend(event)} className="mt-3">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Skriv til det andet hold…"
              className="w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
            />
            {error ? (
              <p className="mt-2 text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className="mt-2 rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court disabled:opacity-60"
            >
              {saving ? "Sender…" : "Send"}
            </button>
          </form>
        </div>
      ) : null}
    </li>
  );
}
