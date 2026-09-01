import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  notificationCopy,
  notificationHref,
  type AppNotification,
} from "../lib/matchmaker";
import { supabase } from "../lib/supabase";
import { setAppBadgeCount, syncAppBadge } from "../lib/appBadge";

export function Notifications() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("notifications")
      .select("id, kind, payload, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(80);
    if (loadError) {
      setError(danishAuthError(loadError.message));
      setReady(true);
      return;
    }
    setRows((data ?? []) as AppNotification[]);
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

  async function openRow(row: AppNotification) {
    if (!row.read_at) {
      await supabase.rpc("mark_notification_read", { p_id: row.id });
      void syncAppBadge();
    }
    navigate(notificationHref(row));
  }

  async function markAll() {
    const { error: markError } = await supabase.rpc(
      "mark_all_notifications_read",
    );
    if (markError) {
      setError(danishAuthError(markError.message));
      return;
    }
    await load();
    void syncAppBadge();
  }

  async function clearAll() {
    setError(null);
    setClearing(true);
    const { error: clearError } = await supabase.rpc("clear_notifications");
    setClearing(false);
    if (clearError) {
      setError(danishAuthError(clearError.message));
      return;
    }
    await load();
    void setAppBadgeCount(0);
  }

  const unread = rows.filter((row) => !row.read_at).length;

  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-4 pb-16 sm:px-6">
        <h1 className="font-display text-5xl tracking-wide sm:text-6xl">Nyt</h1>
        <p className="mt-2 text-sm text-line/65">
          Det der vedrører dig, siden sidst du kiggede her.
        </p>
        {rows.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAll()}
                className="text-sm font-semibold text-ball"
              >
                Marker alle som læst
              </button>
            ) : null}
            <button
              type="button"
              disabled={clearing}
              onClick={() => void clearAll()}
              className="text-sm font-semibold text-line/70 disabled:opacity-60"
            >
              {clearing ? "Ryddes…" : "Ryd"}
            </button>
          </div>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="mt-6 space-y-2">
          {rows.length === 0 ? (
            <li className="rounded-2xl border border-line/10 bg-court-mid px-4 py-4 text-sm text-line/60">
              Intet nyt.
            </li>
          ) : (
            rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => void openRow(row)}
                  className={`flex w-full min-h-14 flex-col items-start rounded-2xl border px-4 py-3 text-left touch-manipulation ${
                    row.read_at
                      ? "border-line/10 bg-court-mid/70"
                      : "border-ball/40 bg-court-mid"
                  }`}
                >
                  <span className="font-semibold">{notificationCopy(row)}</span>
                  <span className="mt-1 text-xs text-line/50">
                    {new Intl.DateTimeFormat("da-DK", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(row.created_at))}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <Link to="/" className="mt-8 text-sm font-semibold text-ball">
          Tilbage til hjem
        </Link>
      </main>
    </SiteShell>
  );
}
