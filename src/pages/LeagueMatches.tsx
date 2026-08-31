import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { MatchList } from "../components/MatchList";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import { fetchLatestLeague } from "../lib/league";
import {
  MATCH_SELECT,
  type MatchCard,
  type MatchPlayer,
  type MatchRow,
  type MatchSet,
} from "../lib/match";
import { supabase } from "../lib/supabase";

export function LeagueMatches() {
  const { user, loading } = useAuth();
  const [title, setTitle] = useState("Liga");
  const [matches, setMatches] = useState<MatchCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const league = await fetchLatestLeague();
    if (!league) {
      setMissing(true);
      setReady(true);
      return;
    }
    setTitle(league.name);

    const { data: fixtures, error: fixtureError } = await supabase
      .from("league_fixtures")
      .select("match_id")
      .eq("league_id", league.id);
    if (fixtureError) {
      setError(danishAuthError(fixtureError.message));
      setReady(true);
      return;
    }

    const ids = [
      ...new Set(
        (fixtures ?? [])
          .map((row) => row.match_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ids.length === 0) {
      setMatches([]);
      setReady(true);
      return;
    }

    const [{ data: rows, error: loadError }, { data: playerRows }, { data: setRows }, { data: correctionRows }] =
      await Promise.all([
        supabase.from("matches").select(MATCH_SELECT).in("id", ids),
        supabase.from("match_players").select("*").in("match_id", ids),
        supabase.from("match_sets").select("*").in("match_id", ids),
        supabase.from("match_result_corrections").select("match_id").in("match_id", ids),
      ]);
    if (loadError) {
      setError(danishAuthError(loadError.message));
      setReady(true);
      return;
    }

    const disputed = new Set(
      (correctionRows ?? []).map((row) => row.match_id as string),
    );
    setMatches(
      ((rows ?? []) as MatchRow[]).map((row) => ({
        ...row,
        disputed: disputed.has(row.id),
        players: ((playerRows ?? []) as MatchPlayer[]).filter(
          (player) => player.match_id === row.id,
        ),
        sets: ((setRows ?? []) as MatchSet[]).filter(
          (setRow) => setRow.match_id === row.id,
        ),
      })),
    );
    setReady(true);
  }, []);

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

  if (!user) return <Navigate to="/login" replace />;

  if (missing) {
    return (
      <SiteShell>
        <main className="mx-auto max-w-xl px-6 pb-16">
          <h1 className="font-display text-5xl">Ingen liga</h1>
          <Link to="/liga" className="mt-4 inline-block text-sm font-semibold text-ball">
            Tilbage til liga
          </Link>
        </main>
      </SiteShell>
    );
  }

  const upcoming = matches
    .filter((row) => row.status === "scheduled")
    .sort(
      (a, b) =>
        new Date(a.played_at).getTime() - new Date(b.played_at).getTime(),
    );
  const played = matches
    .filter((row) => row.status === "played")
    .sort(
      (a, b) =>
        new Date(b.played_at).getTime() - new Date(a.played_at).getTime(),
    );

  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-6 pb-16">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
          {title}
        </p>
        <h1 className="mt-2 font-display text-6xl tracking-wide">Ligakampe</h1>
        <Link to="/liga" className="mt-2 text-sm font-semibold text-ball">
          Tilbage til liga
        </Link>
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <h2 className="mt-10 font-display text-3xl tracking-wide">Kommende</h2>
        <MatchList
          rows={upcoming}
          empty="Ingen planlagte ligakampe i sæsonen."
          userId={user.id}
          highlightOwn
        />

        <h2 className="mt-10 font-display text-3xl tracking-wide">Spillet</h2>
        <MatchList
          rows={played}
          empty="Ingen spillede ligakampe i sæsonen endnu."
        />
      </main>
    </SiteShell>
  );
}
