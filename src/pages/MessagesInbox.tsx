import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ChatBubbleIcon } from "../components/ChatBubbleIcon";
import { MemberAvatar } from "../components/MemberAvatar";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  fetchDirectInbox,
  threadPath,
  type DirectInboxRow,
} from "../lib/messages";
import {
  fetchMembersByIds,
  fullName,
  type PartnerPreview,
} from "../lib/profile";

export function MessagesInbox() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<DirectInboxRow[]>([]);
  const [names, setNames] = useState<Map<string, PartnerPreview>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const inbox = await fetchDirectInbox();
      const people = await fetchMembersByIds(inbox.map((row) => row.other_id));
      setRows(inbox);
      setNames(people);
      setError(null);
    } catch (loadError) {
      setError(danishAuthError((loadError as Error).message));
    } finally {
      setReady(true);
    }
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

  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-4 pb-16 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
          Klubben
        </p>
        <h1 className="mt-2 font-display text-6xl tracking-wide">Beskeder</h1>
        <p className="mt-2 text-sm text-line/65">
          Skriv privat med andre medlemmer. Start en tråd fra medlemslisten eller
          en profil.
        </p>
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="mt-6 space-y-2">
          {rows.length === 0 ? (
            <li className="rounded-2xl border border-line/10 bg-court-mid px-4 py-4 text-sm text-line/60">
              Ingen samtaler endnu. Åbn et medlem og tryk Send besked.
            </li>
          ) : (
            rows.map((row) => {
              const person = names.get(row.other_id);
              const preview = row.last_body?.trim() || "Ingen beskeder endnu.";
              return (
                <li key={row.thread_id}>
                  <Link
                    to={threadPath(row.thread_id)}
                    className={`flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 touch-manipulation ${
                      row.unread
                        ? "border-ball/40 bg-court-mid"
                        : "border-line/10 bg-court-mid/70"
                    }`}
                  >
                    {person ? (
                      <MemberAvatar person={person} size="sm" />
                    ) : (
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-court text-ball">
                        <ChatBubbleIcon />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {person ? fullName(person) : "Medlem"}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-line/60">
                        {preview}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })
          )}
        </ul>
        <Link to="/medlemmer" className="mt-8 text-sm font-semibold text-ball">
          Find et medlem
        </Link>
      </main>
    </SiteShell>
  );
}
