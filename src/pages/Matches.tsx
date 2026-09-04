import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { MatchList } from "../components/MatchList";
import { SiteShell } from "../components/SiteShell";
import { Button } from "../components/ui/Button";
import { Page, PageHeader, PageStatus } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  MATCH_SELECT,
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
      .select(MATCH_SELECT)
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
    const [{ data: playerRows }, { data: setRows }, { data: correctionRows }] =
      await Promise.all([
        supabase.from("match_players").select("*").in("match_id", ids),
        supabase.from("match_sets").select("*").in("match_id", ids),
        supabase
          .from("match_result_corrections")
          .select("match_id")
          .in("match_id", ids),
      ]);
    const disputed = new Set(
      (correctionRows ?? []).map((row) => row.match_id as string),
    );

    setMatches(
      list.map((row) => ({
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
        <PageStatus>Indlæser…</PageStatus>
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
      <Page>
        <PageHeader title="Kampe" />
        <Button to="/kampe/ny" className="mt-6 w-fit">
          Opret kamp
        </Button>
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <h2 className="mt-10 font-display text-2xl tracking-wide">Kommende</h2>
        <MatchList
          rows={upcoming}
          empty="Ingen planlagte kampe."
          userId={user.id}
          highlightOwn
        />

        <h2 className="mt-10 font-display text-2xl tracking-wide">Spillet</h2>
        <MatchList rows={played} empty="Ingen registrerede resultater endnu." />
      </Page>
    </SiteShell>
  );
}
