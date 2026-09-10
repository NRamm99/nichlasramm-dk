import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { LeagueBadge } from "../components/LeagueBadge";
import { MatchRosterFields, SetScores } from "../components/MatchFields";
import { MatchScoreboard } from "../components/MatchScoreboard";
import { ChatComposer, ChatThread } from "../components/ChatThread";
import { SiteShell } from "../components/SiteShell";
import { BackLink, Page, PageStatus } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  formatMatchWhen,
  isSinglesMatch,
  matchSetsToForm,
  parseProposedPlayers,
  parseProposedSets,
  picksFromMatchPlayers,
  proposedSetScoreLine,
  rosterPicksToJson,
  teamPlayers,
  validateMatchSets,
  type MatchComment,
  type MatchPlayer,
  type MatchResultCorrection,
  type MatchRow,
  type MatchSet,
  type PlayerPick,
  type ProposedMatchPlayer,
} from "../lib/match";
import {
  fetchMembersByIds,
  fullName,
  profilePath,
  type PartnerPreview,
} from "../lib/profile";
import { fetchMatchRatingEvents, fetchPlayerRatingsByIds, withRating, type RatingEvent } from "../lib/rating";
import { supabase } from "../lib/supabase";

export function MatchDetail() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [players, setPlayers] = useState<MatchPlayer[]>([]);
  const [sets, setSets] = useState<MatchSet[]>([]);
  const [comments, setComments] = useState<MatchComment[]>([]);
  const [usernames, setUsernames] = useState<Map<string, string>>(new Map());
  const [ratingEvents, setRatingEvents] = useState<Map<string, RatingEvent>>(
    new Map(),
  );
  const [currentRatings, setCurrentRatings] = useState<Map<string, number>>(
    new Map(),
  );
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState(0);
  const [resultSets, setResultSets] = useState([{ team1: "", team2: "" }]);
  const [savingResult, setSavingResult] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [correction, setCorrection] = useState<MatchResultCorrection | null>(
    null,
  );
  const [editingResult, setEditingResult] = useState(false);
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [members, setMembers] = useState<PartnerPreview[]>([]);
  const [isLeagueMatch, setIsLeagueMatch] = useState(false);
  const [rosterPicks, setRosterPicks] = useState<Array<PlayerPick | null>>([
    null,
    null,
    null,
    null,
  ]);
  const [editingRoster, setEditingRoster] = useState(false);

  const load = useCallback(async () => {
    if (!matchId) return;
    setError(null);

    const { data, error: loadError } = await supabase
      .from("matches")
      .select("id, created_at, created_by, played_at, status")
      .eq("id", matchId)
      .maybeSingle();

    if (loadError) {
      setError(danishAuthError(loadError.message));
      return;
    }
    if (!data) {
      setMissing(true);
      return;
    }

    const [
      { data: playerRows },
      { data: setRows },
      { data: commentRows },
      { data: correctionRow },
      { data: fixtureRow },
      { data: memberRows },
      matchRatings,
    ] = await Promise.all([
      supabase.from("match_players").select("*").eq("match_id", matchId),
      supabase
        .from("match_sets")
        .select("*")
        .eq("match_id", matchId)
        .order("set_number"),
      supabase
        .from("match_comments")
        .select("id, match_id, author_id, body, created_at")
        .eq("match_id", matchId)
        .order("created_at"),
      supabase
        .from("match_result_corrections")
        .select("match_id, proposed_by, sets, players, created_at")
        .eq("match_id", matchId)
        .maybeSingle(),
      supabase
        .from("league_fixtures")
        .select("id")
        .eq("match_id", matchId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("id, username, first_name, last_name, avatar_url")
        .is("banned_at", null)
        .order("first_name"),
      fetchMatchRatingEvents(matchId).catch(
        () => new Map<string, RatingEvent>(),
      ),
    ]);

    const [people, ratingRows] = await Promise.all([
      fetchMembersByIds([
        ...(playerRows ?? []).map((row) => row.profile_id),
        ...(commentRows ?? []).map((row) => row.author_id),
        correctionRow?.proposed_by,
      ]),
      fetchPlayerRatingsByIds(
        (playerRows ?? []).map((row) => row.profile_id),
      ).catch(() => new Map()),
    ]);

    const nameMap = new Map<string, string>();
    for (const [id, person] of people) {
      if (person.username) nameMap.set(id, person.username);
    }
    setUsernames(nameMap);

    setMatch(data as MatchRow);
    setPlayers((playerRows ?? []) as MatchPlayer[]);
    setSets((setRows ?? []) as MatchSet[]);
    setComments(
      ((commentRows ?? []) as Omit<MatchComment, "author">[]).map((row) => ({
        ...row,
        author: people.get(row.author_id) ?? null,
      })),
    );
    setIsLeagueMatch(Boolean(fixtureRow));
    setMembers((memberRows ?? []) as PartnerPreview[]);
    setRatingEvents(matchRatings);
    const liveRatings = new Map<string, number>();
    for (const [id, row] of ratingRows) liveRatings.set(id, row.rating);
    setCurrentRatings(liveRatings);
    setCorrection(
      correctionRow
        ? {
            match_id: correctionRow.match_id,
            proposed_by: correctionRow.proposed_by,
            sets: parseProposedSets(correctionRow.sets),
            players: parseProposedPlayers(correctionRow.players),
            created_at: correctionRow.created_at,
          }
        : null,
    );
  }, [matchId]);

  useEffect(() => {
    if (!loading && user) void load();
  }, [load, loading, user]);

  if (loading) {
    return (
      <SiteShell>
        <PageStatus>Indlæser…</PageStatus>
      </SiteShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (missing) {
    return (
      <SiteShell>
        <Page center>
          <h1 className="font-display text-5xl">Kampen findes ikke</h1>
          <BackLink to="/kampe">Kampe</BackLink>
        </Page>
      </SiteShell>
    );
  }

  const isPlayer = players.some((player) => player.profile_id === user.id);
  const playerRatings = new Map(currentRatings);
  const playerDeltas = new Map<string, number>();
  for (const [id, event] of ratingEvents) {
    playerRatings.set(id, event.rating_after);
    playerDeltas.set(id, event.delta);
  }
  const canDelete = isPlayer || isAdmin;
  const myTeam = players.find((player) => player.profile_id === user.id)?.team;
  const proposerTeam = players.find(
    (player) => player.profile_id === correction?.proposed_by,
  )?.team;
  const hasOpposingMember = players.some(
    (player) =>
      Boolean(player.profile_id) &&
      player.team !== proposerTeam,
  );
  const canConfirm = Boolean(
    correction &&
      (isAdmin ||
        (isPlayer &&
          user.id !== correction.proposed_by &&
          (!hasOpposingMember || myTeam !== proposerTeam))),
  );

  function parsedResultSets() {
    return resultSets.map((row) => ({
      team1: Number(row.team1),
      team2: Number(row.team2),
    }));
  }

  function rosterPayload() {
    if (isLeagueMatch) return null;
    return rosterPicksToJson(rosterPicks);
  }

  async function handleComment() {
    if (!matchId) return;
    setError(null);
    setSaving(true);
    const { error: commentError } = await supabase.rpc("add_match_comment", {
      p_match_id: matchId,
      p_body: comment,
    });
    setSaving(false);
    if (commentError) {
      setError(danishAuthError(commentError.message));
      return;
    }
    setComment("");
    setPin((value) => value + 1);
    await load();
  }

  async function handleResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matchId) return;
    const parsed = resultSets.map((row) => ({
      team1: Number(row.team1),
      team2: Number(row.team2),
    }));
    const setErrorCode = validateMatchSets(parsed);
    if (setErrorCode) {
      setError(danishAuthError(setErrorCode));
      return;
    }
    setError(null);
    setSavingResult(true);
    const { error: resultError } = await supabase.rpc("record_match_result", {
      p_match_id: matchId,
      p_sets: parsed,
    });
    setSavingResult(false);
    if (resultError) {
      setError(danishAuthError(resultError.message));
      return;
    }
    setInfo("Resultatet er gemt.");
    await load();
  }

  async function handleDelete() {
    if (!matchId) return;
    const confirmed = window.confirm(
      "Slet kampen? Resultat, spillere og kommentarer forsvinder.",
    );
    if (!confirmed) return;
    setError(null);
    setDeleting(true);
    const { error: deleteError } = await supabase.rpc("delete_match", {
      p_match_id: matchId,
    });
    setDeleting(false);
    if (deleteError) {
      setError(danishAuthError(deleteError.message));
      return;
    }
    navigate("/kampe", { replace: true });
  }

  async function handlePropose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matchId) return;
    const parsed = parsedResultSets();
    const setErrorCode = validateMatchSets(parsed);
    if (setErrorCode) {
      setError(danishAuthError(setErrorCode));
      return;
    }
    const playersPayload = rosterPayload();
    if (!isLeagueMatch && !playersPayload) {
      setError(danishAuthError("PLAYER_REQUIRED"));
      return;
    }
    setError(null);
    setSavingCorrection(true);
    const { error: proposeError } = await supabase.rpc(
      "propose_match_result_correction",
      {
        p_match_id: matchId,
        p_sets: parsed,
        p_players: playersPayload,
      },
    );
    setSavingCorrection(false);
    if (proposeError) {
      setError(danishAuthError(proposeError.message));
      return;
    }
    setEditingResult(false);
    setInfo(
      "Rettelsen er sendt. Det andet hold skal godkende, før den træder i kraft.",
    );
    await load();
  }

  async function handleForceResult() {
    if (!matchId) return;
    const parsed = parsedResultSets();
    const setErrorCode = validateMatchSets(parsed);
    if (setErrorCode) {
      setError(danishAuthError(setErrorCode));
      return;
    }
    const playersPayload = rosterPayload();
    if (!isLeagueMatch && !playersPayload) {
      setError(danishAuthError("PLAYER_REQUIRED"));
      return;
    }
    setError(null);
    setSavingCorrection(true);
    const { error: forceError } = await supabase.rpc("replace_match_result", {
      p_match_id: matchId,
      p_sets: parsed,
      p_players: playersPayload,
    });
    setSavingCorrection(false);
    if (forceError) {
      setError(danishAuthError(forceError.message));
      return;
    }
    setEditingResult(false);
    setInfo("Resultatet er rettet.");
    await load();
  }

  async function handleProposeRoster(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matchId || isLeagueMatch) return;
    const playersPayload = rosterPayload();
    if (!playersPayload) {
      setError(danishAuthError("PLAYER_REQUIRED"));
      return;
    }
    setError(null);
    setSavingCorrection(true);
    const { error: proposeError } = await supabase.rpc(
      "propose_match_result_correction",
      {
        p_match_id: matchId,
        p_sets: [],
        p_players: playersPayload,
      },
    );
    setSavingCorrection(false);
    if (proposeError) {
      setError(danishAuthError(proposeError.message));
      return;
    }
    setEditingRoster(false);
    setInfo(
      "Rettelsen er sendt. Det andet hold skal godkende, før den træder i kraft.",
    );
    await load();
  }

  async function handleAcceptCorrection() {
    if (!matchId) return;
    setError(null);
    setSavingCorrection(true);
    const { error: acceptError } = await supabase.rpc(
      "accept_match_result_correction",
      { p_match_id: matchId },
    );
    setSavingCorrection(false);
    if (acceptError) {
      setError(danishAuthError(acceptError.message));
      return;
    }
    setInfo("Det nye resultat er godkendt.");
    await load();
  }

  async function handleRejectCorrection() {
    if (!matchId) return;
    setError(null);
    setSavingCorrection(true);
    const { error: rejectError } = await supabase.rpc(
      "reject_match_result_correction",
      { p_match_id: matchId },
    );
    setSavingCorrection(false);
    if (rejectError) {
      setError(danishAuthError(rejectError.message));
      return;
    }
    setInfo("Rettelsen er afvist. Det gamle resultat står.");
    await load();
  }

  async function handleWithdrawCorrection() {
    if (!matchId) return;
    setError(null);
    setSavingCorrection(true);
    const { error: withdrawError } = await supabase.rpc(
      "withdraw_match_result_correction",
      { p_match_id: matchId },
    );
    setSavingCorrection(false);
    if (withdrawError) {
      setError(danishAuthError(withdrawError.message));
      return;
    }
    setInfo("Rettelsen er trukket tilbage.");
    await load();
  }

  return (
    <SiteShell>
      <Page className="max-w-2xl">
        <BackLink to="/kampe">Kampe</BackLink>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
            {match?.status === "played" ? "Spillet" : "Planlagt"}
          </p>
          {isLeagueMatch ? <LeagueBadge /> : null}
        </div>
        <h1 className="mt-2 font-display text-4xl tracking-wide sm:text-5xl lg:text-4xl">
          {isLeagueMatch
            ? "Ligakamp"
            : isSinglesMatch(players)
              ? "Single"
              : "Kamp"}
        </h1>
        {match ? (
          <p className="mt-2 text-sm text-line/70">
            {formatMatchWhen(match.played_at)}
          </p>
        ) : (
          <p className="mt-2 text-sm text-line/60">Indlæser…</p>
        )}

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

        {sets.length > 0 ? (
          <section className="mt-8">
            <MatchScoreboard
              players={players}
              sets={sets}
              usernames={usernames}
              ratings={playerRatings}
              ratingDeltas={playerDeltas}
            />
            {correction ? (
              <div className="mt-4 rounded-[var(--radius-card)] border border-red-400/30 bg-red-400/5 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
                  Uenighed om kampen
                </p>
                <p className="mt-2 text-sm text-line/75">
                  {correction.sets.length > 0 ? (
                    <>
                      Foreslået resultat:{" "}
                      <span className="font-semibold text-line">
                        {proposedSetScoreLine(correction.sets)}
                      </span>
                      .{" "}
                    </>
                  ) : null}
                  {correction.players ? (
                    <>
                      Foreslåede spillere:{" "}
                      <span className="font-semibold text-line">
                        {proposedRosterLine(
                          correction.players,
                          members,
                          playerRatings,
                        )}
                      </span>
                      .{" "}
                    </>
                  ) : null}
                  Det andet hold skal godkende — eller en administrator retter
                  det.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canConfirm ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleAcceptCorrection()}
                        disabled={savingCorrection}
                        className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court disabled:opacity-60"
                      >
                        {savingCorrection ? "Gemmer…" : "Godkend"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRejectCorrection()}
                        disabled={savingCorrection}
                        className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold disabled:opacity-60"
                      >
                        Afvis
                      </button>
                    </>
                  ) : null}
                  {correction.proposed_by === user.id || isAdmin ? (
                    <button
                      type="button"
                      onClick={() => void handleWithdrawCorrection()}
                      disabled={savingCorrection}
                      className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold disabled:opacity-60"
                    >
                      Træk tilbage
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {(isPlayer || isAdmin) &&
            (!correction ||
              correction.proposed_by === user.id ||
              isAdmin) ? (
              <div className="mt-4">
                {editingResult ? (
                  <form
                    onSubmit={(event) => void handlePropose(event)}
                    className="rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-6"
                  >
                    <h2 className="font-display text-3xl tracking-wide">
                      Ret kamp
                    </h2>
                    <p className="mt-2 text-sm text-line/65">
                      {isLeagueMatch
                        ? "Ligakampens spillere er låst. I kan rette sættene. Det andet hold skal godkende."
                        : "Ret sæt og spillere — fx hvis en gæst nu er medlem. Det andet hold skal godkende."}
                    </p>
                    {!isLeagueMatch ? (
                      <div className="mt-4">
                        <MatchRosterFields
                          members={members}
                          picks={rosterPicks}
                          ratings={playerRatings}
                          onChange={setRosterPicks}
                        />
                      </div>
                    ) : null}
                    <div className="mt-4">
                      <SetScores
                        sets={resultSets}
                        onChange={setResultSets}
                        team1Label="Hold 1"
                        team2Label="Hold 2"
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingResult(false)}
                        className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                      >
                        Annuller
                      </button>
                      <button
                        type="submit"
                        disabled={savingCorrection}
                        className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court disabled:opacity-60"
                      >
                        {savingCorrection ? "Sender…" : "Foreslå ændring"}
                      </button>
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => void handleForceResult()}
                          disabled={savingCorrection}
                          className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold disabled:opacity-60"
                        >
                          Gem som administrator
                        </button>
                      ) : null}
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setResultSets(matchSetsToForm(sets));
                      setRosterPicks(picksFromMatchPlayers(players));
                      setEditingResult(true);
                    }}
                    className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                  >
                    Ret kamp
                  </button>
                )}
              </div>
            ) : null}
          </section>
        ) : (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-2">
              <TeamCard
                title="Hold 1"
                players={teamPlayers(players, 1)}
                usernames={usernames}
                ratings={playerRatings}
              />
              <TeamCard
                title="Hold 2"
                players={teamPlayers(players, 2)}
                usernames={usernames}
                ratings={playerRatings}
              />
            </section>

            {correction ? (
              <div className="mt-4 rounded-[var(--radius-card)] border border-red-400/30 bg-red-400/5 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
                  Uenighed om kampen
                </p>
                <p className="mt-2 text-sm text-line/75">
                  {correction.players ? (
                    <>
                      Foreslåede spillere:{" "}
                      <span className="font-semibold text-line">
                        {proposedRosterLine(
                          correction.players,
                          members,
                          playerRatings,
                        )}
                      </span>
                      .
                    </>
                  ) : (
                    "Der ligger en rettelse, der skal godkendes."
                  )}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canConfirm ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleAcceptCorrection()}
                        disabled={savingCorrection}
                        className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court disabled:opacity-60"
                      >
                        {savingCorrection ? "Gemmer…" : "Godkend"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRejectCorrection()}
                        disabled={savingCorrection}
                        className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold disabled:opacity-60"
                      >
                        Afvis
                      </button>
                    </>
                  ) : null}
                  {correction.proposed_by === user.id || isAdmin ? (
                    <button
                      type="button"
                      onClick={() => void handleWithdrawCorrection()}
                      disabled={savingCorrection}
                      className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold disabled:opacity-60"
                    >
                      Træk tilbage
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {(isPlayer || isAdmin) &&
            !isLeagueMatch &&
            (!correction ||
              correction.proposed_by === user.id ||
              isAdmin) ? (
              <div className="mt-4">
                {editingRoster ? (
                  <form
                    onSubmit={(event) => void handleProposeRoster(event)}
                    className="rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-6"
                  >
                    <h2 className="font-display text-3xl tracking-wide">
                      Ret spillere
                    </h2>
                    <p className="mt-2 text-sm text-line/65">
                      Skift en gæst til medlem, eller ret de øvrige pladser. Du
                      skal selv blive på holdet.
                    </p>
                    <div className="mt-4">
                      <MatchRosterFields
                        members={members}
                        picks={rosterPicks}
                        ratings={playerRatings}
                        onChange={setRosterPicks}
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingRoster(false)}
                        className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                      >
                        Annuller
                      </button>
                      <button
                        type="submit"
                        disabled={savingCorrection}
                        className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court disabled:opacity-60"
                      >
                        {savingCorrection ? "Sender…" : "Foreslå spillere"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRosterPicks(picksFromMatchPlayers(players));
                      setEditingRoster(true);
                    }}
                    className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                  >
                    Ret spillere
                  </button>
                )}
              </div>
            ) : null}

            <section className="mt-8 rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-6">
              <h2 className="font-display text-3xl tracking-wide">Resultat</h2>
              {isPlayer ? (
                <form
                  onSubmit={(event) => void handleResult(event)}
                  className="mt-4 space-y-4"
                >
                  <p className="text-sm text-line/65">
                    Kampen har ikke et resultat endnu. Registrér sættene her.
                    Sidste sæt må gerne være ufærdigt; det tæller kun, hvis
                    kampen ellers ville være uafgjort.
                  </p>
                  <SetScores
                    sets={resultSets}
                    onChange={setResultSets}
                    team1Label="Hold 1"
                    team2Label="Hold 2"
                  />
                  <button
                    type="submit"
                    disabled={savingResult}
                    className="rounded-full bg-ball px-5 py-2 text-sm font-semibold text-court disabled:opacity-60"
                  >
                    {savingResult ? "Gemmer…" : "Gem resultat"}
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-sm text-line/65">Ikke spillet endnu.</p>
              )}
            </section>
          </>
        )}

        <section className="mt-8 overflow-hidden rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-6">
          <h2 className="font-display text-3xl tracking-wide">Kommentarer</h2>
          <div className="mt-4">
            <ChatThread
              scrollKey={`${comments.length}:${comments[comments.length - 1]?.id ?? "empty"}`}
              pin={pin}
              footer={
                isPlayer ? (
                  <ChatComposer
                    id="match-comment"
                    value={comment}
                    onChange={setComment}
                    onSubmit={() => void handleComment()}
                    sending={saving}
                    placeholder="Skriv til de andre spillere…"
                  />
                ) : (
                  <p className="text-xs text-line/50">
                    Kun spillere i kampen kan skrive med.
                  </p>
                )
              }
            >
              <ul className="space-y-3">
                {comments.length === 0 ? (
                  <li className="text-sm text-line/60">Ingen kommentarer endnu.</li>
                ) : (
                  comments.map((row) => (
                    <li key={row.id} className="rounded-2xl bg-court/60 px-4 py-3">
                      <p className="text-xs text-line/50">
                        {row.author
                          ? withRating(
                              fullName(row.author),
                              playerRatings.get(row.author.id),
                            )
                          : "Ukendt"}{" "}
                        · {formatMatchWhen(row.created_at)}
                      </p>
                      <p className="mt-1 text-sm text-line/85">{row.body}</p>
                    </li>
                  ))
                )}
              </ul>
            </ChatThread>
          </div>
        </section>

        {canDelete ? (
          <div className="mt-10 border-t border-line/10 pt-6">
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="text-sm font-semibold text-red-300/90 hover:text-red-200 disabled:opacity-60"
            >
              {deleting ? "Sletter…" : "Slet kamp"}
            </button>
          </div>
        ) : null}
      </Page>
    </SiteShell>
  );
}

function proposedRosterLine(
  players: ProposedMatchPlayer[],
  members: PartnerPreview[],
  ratings: Map<string, number>,
) {
  return [...players]
    .sort((a, b) => a.team - b.team || a.slot - b.slot)
    .map((player) => {
      if (player.profile_id) {
        const member = members.find((row) => row.id === player.profile_id);
        const name = member ? fullName(member) : "Medlem";
        return withRating(name, ratings.get(player.profile_id));
      }
      return player.guest_name || "Gæst";
    })
    .join(" · ");
}

function TeamCard({
  title,
  players,
  usernames,
  ratings,
}: {
  title: string;
  players: MatchPlayer[];
  usernames: Map<string, string>;
  ratings: Map<string, number>;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
        {title}
      </p>
      <ul className="mt-3 space-y-2">
        {players.map((player) => {
          const username = player.profile_id
            ? usernames.get(player.profile_id)
            : undefined;
          const rating = player.profile_id
            ? ratings.get(player.profile_id)
            : undefined;
          const name =
            rating == null
              ? player.display_name
              : `${player.display_name} (${rating})`;
          return (
            <li key={player.id} className="text-sm font-semibold text-line">
              {username ? (
                <Link
                  to={profilePath(username)}
                  className="hover:text-ball hover:underline"
                >
                  {name}
                </Link>
              ) : (
                <>
                  {name}{" "}
                  {player.guest_name ? (
                    <span className="text-xs font-normal text-line/45">
                      gæst
                    </span>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
