import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { SetScores } from "../components/MatchFields";
import { MatchScoreboard } from "../components/MatchScoreboard";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  formatMatchWhen,
  matchSetsToForm,
  parseProposedSets,
  proposedSetScoreLine,
  teamPlayers,
  validateMatchSets,
  type MatchComment,
  type MatchPlayer,
  type MatchResultCorrection,
  type MatchRow,
  type MatchSet,
} from "../lib/match";
import { fetchMembersByIds, fullName, profilePath } from "../lib/profile";
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
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [resultSets, setResultSets] = useState([{ team1: "", team2: "" }]);
  const [savingResult, setSavingResult] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [correction, setCorrection] = useState<MatchResultCorrection | null>(
    null,
  );
  const [editingResult, setEditingResult] = useState(false);
  const [savingCorrection, setSavingCorrection] = useState(false);

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
        .select("match_id, proposed_by, sets, created_at")
        .eq("match_id", matchId)
        .maybeSingle(),
    ]);

    const people = await fetchMembersByIds([
      ...(playerRows ?? []).map((row) => row.profile_id),
      ...(commentRows ?? []).map((row) => row.author_id),
      correctionRow?.proposed_by,
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
    setCorrection(
      correctionRow
        ? {
            match_id: correctionRow.match_id,
            proposed_by: correctionRow.proposed_by,
            sets: parseProposedSets(correctionRow.sets),
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
        <main className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center px-6 text-sm text-line/60">
          Indlæser…
        </main>
      </SiteShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (missing) {
    return (
      <SiteShell>
        <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col justify-center px-6 pb-16">
          <h1 className="font-display text-5xl">Kampen findes ikke</h1>
          <Link to="/kampe" className="mt-6 text-sm font-semibold text-ball">
            Tilbage til kampe
          </Link>
        </main>
      </SiteShell>
    );
  }

  const isPlayer = players.some((player) => player.profile_id === user.id);
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

  async function handleComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    setError(null);
    setSavingCorrection(true);
    const { error: proposeError } = await supabase.rpc(
      "propose_match_result_correction",
      {
        p_match_id: matchId,
        p_sets: parsed,
      },
    );
    setSavingCorrection(false);
    if (proposeError) {
      setError(danishAuthError(proposeError.message));
      return;
    }
    setEditingResult(false);
    setInfo(
      "Rettelsen er sendt. Det andet hold skal godkende, før stillingen ændres.",
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
    setError(null);
    setSavingCorrection(true);
    const { error: forceError } = await supabase.rpc("replace_match_result", {
      p_match_id: matchId,
      p_sets: parsed,
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
      <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-2xl flex-col px-6 pb-16">
        <Link to="/kampe" className="text-sm font-semibold text-ball">
          Tilbage til kampe
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-ball">
          {match?.status === "played" ? "Spillet" : "Planlagt"}
        </p>
        <h1 className="mt-2 font-display text-6xl tracking-wide">Kamp</h1>
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
            />
            {correction ? (
              <div className="mt-4 rounded-3xl border border-amber-200/30 bg-amber-200/5 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90">
                  Uenighed om resultatet
                </p>
                <p className="mt-2 text-sm text-line/75">
                  Foreslået nyt resultat:{" "}
                  <span className="font-semibold text-line">
                    {proposedSetScoreLine(correction.sets)}
                  </span>
                  . I en liga tæller kampen ikke i stillingen, før det andet hold
                  godkender — eller en administrator retter det.
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
                        {savingCorrection ? "Gemmer…" : "Godkend nyt resultat"}
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
                    className="rounded-3xl border border-line/10 bg-court-mid/80 p-6"
                  >
                    <h2 className="font-display text-3xl tracking-wide">
                      Ret sæt
                    </h2>
                    <p className="mt-2 text-sm text-line/65">
                      Det andet hold skal godkende, før det tæller i ligaen.
                      Slet kampen kun hvis I spillede en anden kamp.
                    </p>
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
                        {savingCorrection ? "Sender…" : "Foreslå nyt resultat"}
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
                      setEditingResult(true);
                    }}
                    className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                  >
                    Ret sæt
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
              />
              <TeamCard
                title="Hold 2"
                players={teamPlayers(players, 2)}
                usernames={usernames}
              />
            </section>

            <section className="mt-8 rounded-3xl border border-line/10 bg-court-mid/80 p-6">
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

        <section className="mt-8 rounded-3xl border border-line/10 bg-court-mid/80 p-6">
          <h2 className="font-display text-3xl tracking-wide">Kommentarer</h2>
          <ul className="mt-4 space-y-3">
            {comments.length === 0 ? (
              <li className="text-sm text-line/60">Ingen kommentarer endnu.</li>
            ) : (
              comments.map((row) => (
                <li key={row.id} className="rounded-2xl bg-court/60 px-4 py-3">
                  <p className="text-xs text-line/50">
                    {row.author ? fullName(row.author) : "Ukendt"} ·{" "}
                    {formatMatchWhen(row.created_at)}
                  </p>
                  <p className="mt-1 text-sm text-line/85">{row.body}</p>
                </li>
              ))
            )}
          </ul>
          {isPlayer ? (
            <form
              onSubmit={(event) => void handleComment(event)}
              className="mt-4 space-y-3"
            >
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Skriv til de andre spillere…"
                className="w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-ball px-5 py-2 text-sm font-semibold text-court disabled:opacity-60"
              >
                {saving ? "Sender…" : "Send"}
              </button>
            </form>
          ) : (
            <p className="mt-4 text-xs text-line/50">
              Kun spillere i kampen kan skrive med.
            </p>
          )}
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
      </main>
    </SiteShell>
  );
}

function TeamCard({
  title,
  players,
  usernames,
}: {
  title: string;
  players: MatchPlayer[];
  usernames: Map<string, string>;
}) {
  return (
    <div className="rounded-3xl border border-line/10 bg-court-mid/80 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
        {title}
      </p>
      <ul className="mt-3 space-y-2">
        {players.map((player) => {
          const username = player.profile_id
            ? usernames.get(player.profile_id)
            : undefined;
          return (
            <li key={player.id} className="text-sm font-semibold text-line">
              {username ? (
                <Link
                  to={profilePath(username)}
                  className="hover:text-ball hover:underline"
                >
                  {player.display_name}
                </Link>
              ) : (
                <>
                  {player.display_name}{" "}
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
