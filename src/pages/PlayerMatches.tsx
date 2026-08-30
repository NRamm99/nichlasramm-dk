import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { MatchList } from "../components/MatchList";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  fetchPlayerMatches,
  type MatchCard,
} from "../lib/match";
import { fullName, profilePath, type PublicProfile } from "../lib/profile";
import { supabase } from "../lib/supabase";

export function PlayerMatches() {
  const { username } = useParams();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [matches, setMatches] = useState<MatchCard[]>([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!username) return;
    setError(null);
    setMissing(false);

    const { data, error: loadError } = await supabase
      .from("profiles")
      .select("id, username, first_name, last_name, avatar_url, bio, partner_id")
      .eq("username", username.toLowerCase())
      .is("banned_at", null)
      .maybeSingle();

    if (loadError) {
      setError(danishAuthError(loadError.message));
      setReady(true);
      return;
    }
    if (!data) {
      setMissing(true);
      setProfile(null);
      setMatches([]);
      setReady(true);
      return;
    }

    const person = { ...data, partner: null } as PublicProfile;
    setProfile(person);
    try {
      setMatches(await fetchPlayerMatches(data.id));
    } catch {
      setMatches([]);
    }
    setReady(true);
  }, [username]);

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

  if (missing) {
    return (
      <SiteShell>
        <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col justify-center px-6 pb-16">
          <h1 className="font-display text-5xl">Ikke fundet</h1>
          <p className="mt-2 text-sm text-line/65">
            Der findes ikke et medlem med det brugernavn.
          </p>
          <Link to="/profil" className="mt-6 text-sm font-semibold text-ball">
            Tilbage til din profil
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
        <Link
          to={profilePath(profile?.username)}
          className="text-sm font-semibold text-ball"
        >
          Tilbage til profil
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-ball">
          Kampe
        </p>
        <h1 className="mt-2 font-display text-6xl tracking-wide">
          {profile ? fullName(profile) : "Kampe"}
        </h1>
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <h2 className="mt-10 font-display text-3xl tracking-wide">Kommende</h2>
        <MatchList rows={upcoming} empty="Ingen planlagte kampe." />

        <h2 className="mt-10 font-display text-3xl tracking-wide">Spillet</h2>
        <MatchList
          rows={played}
          empty="Ingen kampe registreret."
          resultFor={profile?.id}
        />
      </main>
    </SiteShell>
  );
}
