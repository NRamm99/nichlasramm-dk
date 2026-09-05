import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { SiteShell } from "../components/SiteShell";
import { BackLink, Page } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import { openDirectThread, threadPath } from "../lib/messages";
import { supabase } from "../lib/supabase";

export function MessageOpen() {
  const { username } = useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user || !username) return;
    let cancelled = false;
    void (async () => {
      const { data, error: loadError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username.toLowerCase())
        .is("banned_at", null)
        .maybeSingle();
      if (cancelled) return;
      if (loadError) {
        setError(danishAuthError(loadError.message));
        return;
      }
      if (!data) {
        setError(danishAuthError("MEMBER_NOT_FOUND"));
        return;
      }
      try {
        const threadId = await openDirectThread(data.id);
        if (!cancelled) navigate(threadPath(threadId), { replace: true });
      } catch (openError) {
        if (!cancelled) setError(danishAuthError((openError as Error).message));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, navigate, user, username]);

  if (!loading && !user) return <Navigate to="/login" replace />;

  return (
    <SiteShell>
      <Page center>
        {error ? (
          <>
            <h1 className="font-display text-5xl">Besked</h1>
            <p className="mt-4 text-sm text-red-300" role="alert">
              {error}
            </p>
            <BackLink to="/medlemmer">Medlemmer</BackLink>
          </>
        ) : (
          <p className="text-sm text-line/60">Åbner samtale…</p>
        )}
      </Page>
    </SiteShell>
  );
}
