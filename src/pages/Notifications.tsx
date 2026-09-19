import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { SiteShell } from "../components/SiteShell";
import { Button } from "../components/ui/Button";
import { ListEmpty, ListGroup } from "../components/ui/ListGroup";
import { BackLink, Page, PageHeader } from "../components/ui/Page";
import { SkeletonListRows, SkeletonRegion } from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { afterNotificationsRead, setAppBadgeCount } from "../lib/appBadge";
import { danishAuthError } from "../lib/authErrors";
import {
  notificationCopy,
  notificationHref,
  type AppNotification,
} from "../lib/matchmaker";
import { supabase } from "../lib/supabase";

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

  if (!loading && !user) return <Navigate to="/login" replace />;

  if (loading || !ready) {
    return (
      <SiteShell>
        <Page>
          <BackLink to="/">Hjem</BackLink>
          <div className="mt-4">
            <PageHeader
              title="Nyt"
              subtitle="Det der vedrører dig, siden sidst du kiggede her."
            />
          </div>
          <SkeletonRegion>
            <div className="mt-6">
              <SkeletonListRows count={6} avatar={false} />
            </div>
          </SkeletonRegion>
        </Page>
      </SiteShell>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  async function openRow(row: AppNotification) {
    if (!row.read_at) {
      await supabase.rpc("mark_notification_read", { p_id: row.id });
      afterNotificationsRead();
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
    afterNotificationsRead();
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
    afterNotificationsRead();
    void setAppBadgeCount(0);
  }

  const unread = rows.filter((row) => !row.read_at).length;

  return (
    <SiteShell>
      <Page>
        <BackLink to="/">Hjem</BackLink>
        <div className="mt-4">
          <PageHeader
            title="Nyt"
            subtitle="Det der vedrører dig, siden sidst du kiggede her."
          />
        </div>
        {rows.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {unread > 0 ? (
              <Button variant="ghost" onClick={() => void markAll()}>
                Marker alle som læst
              </Button>
            ) : null}
            <Button
              variant="ghost"
              className="text-line/70 hover:text-ball"
              disabled={clearing}
              onClick={() => void clearAll()}
            >
              {clearing ? "Ryddes…" : "Ryd"}
            </Button>
          </div>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <ListGroup className="mt-6">
          {rows.length === 0 ? (
            <ListEmpty>Intet nyt.</ListEmpty>
          ) : (
            rows.map((row) => {
              const isUnread = !row.read_at;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => void openRow(row)}
                    className={`flex w-full min-h-14 items-start gap-3 px-4 py-3 text-left touch-manipulation hover:bg-line/[0.03] ${
                      isUnread ? "bg-ball/[0.08]" : ""
                    }`}
                  >
                    <span
                      className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${
                        isUnread ? "bg-ball" : "invisible"
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block font-semibold ${
                          isUnread ? "text-line" : "text-line/45"
                        }`}
                      >
                        {notificationCopy(row)}
                      </span>
                      <span
                        className={`mt-1 block text-xs ${
                          isUnread ? "text-line/60" : "text-line/35"
                        }`}
                      >
                        {new Intl.DateTimeFormat("da-DK", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(row.created_at))}
                      </span>
                    </span>
                    {isUnread ? (
                      <span className="mt-0.5 shrink-0 rounded-full bg-ball px-2 py-0.5 font-sans text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-court">
                        Ny
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ListGroup>
      </Page>
    </SiteShell>
  );
}
