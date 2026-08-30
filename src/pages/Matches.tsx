import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { MatchList } from "../components/MatchList";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  type MatchCard,
  type MatchPlayer,
  type MatchRow,
  type MatchSet,
} from "../lib/match";
import { supabase } from "../lib/supabase";

export function Matches() {
  const { user, loading } = useAuth();
  const [matches, setMatches] = useState<MatchCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const { data: rows, error: loadError } = await supabase
      .from("matches")
      .select("id, created_at, created_by, played_at, status")
      .order("played_at", { ascending: false });

    if (loadError) {
      setError(danishAuthError(loadError.message));
      setReady(true);
      return;
    }

    const list = (rows ?? []) as MatchRow[];
    if (list.length === 0) {
      setMatches([]);
      setReady(true);
      return;
    }

    const ids = list.map((row) => row.id);
    const [{ data: playerRows }, { data: setRows }] = await Promise.all([
      supabase.from("match_players").select("*").in("match_id", ids),
      supabase.from("match_sets").select("*").in("match_id", ids),
    ]);

    setMatches(
      list.map((row) => ({
        ...row,
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

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const upcoming = matches
    .filter((row) => row.status === "scheduled")
    .sort(
      (a, b) =>
        new Date(a.played_at).getTime() - new Date(b.played_at).getTime(),
    );
  const played = matches.filter((row) => row.status === "played");

  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-6 pb-16">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
          Liga
        </p>
        <h1 className="mt-2 font-display text-6xl tracking-wide">Kampe</h1>
        <Link
          to="/kampe/ny"
          className="mt-6 w-fit rounded-full bg-ball px-6 py-3 text-sm font-semibold text-court"
        >
          Opret kamp
        </Link>
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <h2 className="mt-10 font-display text-3xl tracking-wide">Kommende</h2>
        <MatchList
          rows={upcoming}
          empty="Ingen planlagte kampe."
          userId={user.id}
          highlightOwn
        />

        <h2 className="mt-10 font-display text-3xl tracking-wide">Spillet</h2>
        <MatchList rows={played} empty="Ingen registrerede resultater endnu." />
      </main>
    </SiteShell>
  );
}
