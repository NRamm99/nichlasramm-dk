import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AddToCalendarButton } from "../components/AddToCalendarButton";
import { MatchRosterFields, SetScores } from "../components/MatchFields";
import { LeagueMatchTitle } from "../components/LeagueBadge";
import { MatchLineup, MatchMeta } from "../components/MatchLineup";
import { ChatComposer, ChatThread } from "../components/ChatThread";
import { SiteShell } from "../components/SiteShell";
import { Button } from "../components/ui/Button";
import { BackLink, Page, PageHeader } from "../components/ui/Page";
import { Sheet } from "../components/ui/Sheet";
import { ListGroup } from "../components/ui/ListGroup";
import {
  Skeleton,
  SkeletonCard,
  SkeletonCircle,
  SkeletonRegion,
} from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { syncAppBadge } from "../lib/appBadge";
import { danishAuthError } from "../lib/authErrors";
import {
  asMatchRow,
  formatMatchDate,
  formatMatchRelativeDay,
  formatMatchTime,
  formatMatchTimeRange,
  formatMatchWhen,
  isSinglesMatch,
  matchSetsToForm,
  parseProposedPlayers,
  parseProposedSets,
  picksFromMatchPlayers,
  proposedSetScoreLine,
  rosterPicksToJson,
  validateMatchSets,
  withMatchSelect,
  type MatchComment,
  type MatchPlayer,
  type MatchResultCorrection,
  type MatchRow,
  type MatchSet,
  type PlayerPick,
  type ProposedMatchPlayer,
} from "../lib/match";
import { markMatchCommentsRead } from "../lib/matchmaker";
import {
  fetchMembersByIds,
  fullName,
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
  const [resultSheetOpen, setResultSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [correction, setCorrection] = useState<MatchResultCorrection | null>(
    null,
  );
  const [editingResult, setEditingResult] = useState(false);
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [members, setMembers] = useState<PartnerPreview[]>([]);
  const [peopleById, setPeopleById] = useState<Map<string, PartnerPreview>>(
    new Map(),
  );
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
    const userId = user?.id;
    setError(null);

    const { data, error: loadError } = await withMatchSelect((select) =>
      supabase.from("matches").select(select).eq("id", matchId).maybeSingle(),
    );

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

    setMatch(asMatchRow(data as MatchRow));
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
    setPeopleById(people);
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

    if (
      userId &&
      (playerRows ?? []).some((row) => row.profile_id === userId)
    ) {
      void markMatchCommentsRead(matchId)
        .then(() => void syncAppBadge())
        .catch(() => {
          /* Keep the match page usable if the receipt fails. */
        });
    }
  }, [matchId, user?.id]);

  useEffect(() => {
    if (!loading && user) void load();
  }, [load, loading, user]);

  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  if (loading || (!match && !missing && !error)) {
    return (
      <SiteShell>
        <Page>
          <BackLink to="/kampe">Kampe</BackLink>
          <div className="mt-4">
            <PageHeader title="Kamp" />
          </div>
          <SkeletonRegion>
            <Skeleton className="mt-2 h-4 w-40" />
            <SkeletonCard className="mt-6 p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                <div className="flex items-center gap-2">
                  <SkeletonCircle size="2.75rem" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-8 w-10" />
                <div className="flex items-center justify-end gap-2">
                  <Skeleton className="h-4 w-24" />
                  <SkeletonCircle size="2.75rem" />
                </div>
              </div>
            </SkeletonCard>
            <SkeletonCard className="mt-8 p-6">
              <Skeleton className="h-8 w-36" />
              <Skeleton className="mt-4 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-4/5" />
            </SkeletonCard>
          </SkeletonRegion>
        </Page>
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

  if (!match) {
    return (
      <SiteShell>
        <Page>
          <BackLink to="/kampe">Kampe</BackLink>
          {error ? (
            <p className="mt-4 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
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
    setResultSheetOpen(false);
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
      <Page>
        <BackLink to="/kampe">Kampe</BackLink>
        <div className="mt-4">
          <PageHeader
            title={formatMatchRelativeDay(match.played_at)}
            subtitle={formatMatchDate(match.played_at)}
            action={
              <AddToCalendarButton
                matchId={match.id}
                playedAt={match.played_at}
                status={match.status}
                players={players}
                durationMinutes={match.duration_minutes}
                league={isLeagueMatch}
              />
            }
          />
        </div>

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

        <ListGroup className="mt-6">
          <li
            className={`px-4 pb-4 ${
              isLeagueMatch
                ? "bg-ball/[0.05] pt-4 shadow-[inset_0_0_0_1px_rgba(214,255,61,0.16)]"
                : "pt-4"
            }`}
          >
            {isLeagueMatch ? <LeagueMatchTitle /> : null}
            <MatchMeta
              time={
                match.status === "scheduled"
                  ? formatMatchTimeRange(
                      match.played_at,
                      match.duration_minutes,
                    )
                  : formatMatchTime(match.played_at)
              }
              singles={isSinglesMatch(players)}
              isOwn={isPlayer && match.status === "scheduled"}
              disputed={Boolean(correction)}
              result={null}
            />
            <MatchLineup
              players={players}
              sets={match.status === "played" ? sets : []}
              people={peopleById}
              ratings={playerRatings}
              ratingDeltas={
                match.status === "played" ? playerDeltas : undefined
              }
              size="detail"
              linkProfiles
            />
            {correction ? (
              <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-red-300">
                Uenighed om resultatet
              </p>
            ) : null}
          </li>
        </ListGroup>

        {sets.length > 0 ? (
          <section className="mt-8">
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
                    <h2 className="font-display text-2xl tracking-wide">
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
                    <h2 className="font-display text-2xl tracking-wide">
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
              <h2 className="font-display text-2xl tracking-wide">Resultat</h2>
              {isPlayer ? (
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-line/65">
                    Kampen har ikke et resultat endnu. Registrér sættene, når I
                    er færdige.
                  </p>
                  <Button
                    type="button"
                    onClick={() => setResultSheetOpen(true)}
                  >
                    Gem resultat
                  </Button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-line/65">Ikke spillet endnu.</p>
              )}
            </section>
          </>
        )}

        {match.status === "scheduled" && isPlayer ? (
          <Sheet
            open={resultSheetOpen}
            onClose={() => setResultSheetOpen(false)}
            eyebrow="Kamp"
            title="Gem resultat"
            footer={
              <Button
                type="submit"
                form="match-result-form"
                block
                disabled={savingResult}
              >
                {savingResult ? "Gemmer…" : "Gem resultat"}
              </Button>
            }
          >
            <form
              id="match-result-form"
              onSubmit={(event) => void handleResult(event)}
              className="space-y-4"
            >
              <MatchLineup
                players={players}
                people={peopleById}
                ratings={playerRatings}
                size="detail"
              />
              <SetScores
                sets={resultSets}
                onChange={setResultSets}
                team1Label="Hold 1"
                team2Label="Hold 2"
              />
              {error ? (
                <p className="text-sm text-red-300" role="alert">
                  {error}
                </p>
              ) : null}
            </form>
          </Sheet>
        ) : null}

        <section className="mt-8 overflow-hidden rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-4 lg:p-6">
          <h2 className="font-display text-2xl tracking-wide">Kommentarer</h2>
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
