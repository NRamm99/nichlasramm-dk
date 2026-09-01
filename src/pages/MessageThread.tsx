import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { MemberAvatar } from "../components/MemberAvatar";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  fetchDirectMessages,
  fetchDirectThread,
  markDirectThreadRead,
  otherParticipantId,
  sendDirectMessage,
  type DirectMessage,
} from "../lib/messages";
import { fetchMembersByIds, fullName, profilePath } from "../lib/profile";
import { syncAppBadge } from "../lib/appBadge";

export function MessageThread() {
  const { threadId } = useParams();
  const { user, loading } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [other, setOther] = useState<{
    id: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!user || !threadId) return;
    try {
      const thread = await fetchDirectThread(threadId);
      if (!thread) {
        setMissing(true);
        setReady(true);
        return;
      }
      const otherId = otherParticipantId(thread, user.id);
      const [rows, people] = await Promise.all([
        fetchDirectMessages(threadId),
        fetchMembersByIds([otherId]),
      ]);
      setMessages(rows);
      setOther(people.get(otherId) ?? null);
      setMissing(false);
      setError(null);
      await markDirectThreadRead(threadId);
      void syncAppBadge();
    } catch (loadError) {
      setError(danishAuthError((loadError as Error).message));
    } finally {
      setReady(true);
    }
  }, [threadId, user]);

  useEffect(() => {
    if (!loading && user) void load();
  }, [load, loading, user]);

  useEffect(() => {
    if (!user || !threadId) return;
    const timer = window.setInterval(() => {
      void load();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [load, threadId, user]);

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

  if (missing || !threadId) {
    return (
      <SiteShell>
        <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col justify-center px-6 pb-16">
          <h1 className="font-display text-5xl">Ikke fundet</h1>
          <p className="mt-2 text-sm text-line/65">
            Samtalen findes ikke, eller du har ikke adgang.
          </p>
          <Link to="/beskeder" className="mt-6 text-sm font-semibold text-ball">
            Tilbage til beskeder
          </Link>
        </main>
      </SiteShell>
    );
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!threadId) return;
    setError(null);
    setSending(true);
    try {
      await sendDirectMessage(threadId, body);
      setBody("");
      await load();
    } catch (sendError) {
      setError(danishAuthError((sendError as Error).message));
    } finally {
      setSending(false);
    }
  }

  const title = other ? fullName(other) : "Besked";

  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-4 pb-16 sm:px-6">
        <div className="flex items-center gap-3">
          {other ? <MemberAvatar person={other} size="sm" /> : null}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
              Besked
            </p>
            {other?.username ? (
              <Link
                to={profilePath(other.username)}
                className="font-display text-4xl tracking-wide hover:text-ball"
              >
                {title}
              </Link>
            ) : (
              <h1 className="font-display text-4xl tracking-wide">{title}</h1>
            )}
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <ul className="mt-6 space-y-2">
          {messages.length === 0 ? (
            <li className="text-sm text-line/55">Skriv den første besked.</li>
          ) : (
            messages.map((message) => {
              const mine = message.author_id === user.id;
              return (
                <li
                  key={message.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                      mine
                        ? "rounded-br-md bg-ball text-court"
                        : "rounded-bl-md bg-court-mid text-line"
                    }`}
                  >
                    <p>{message.body}</p>
                    <p
                      className={`mt-1 text-[0.65rem] ${
                        mine ? "text-court/70" : "text-line/45"
                      }`}
                    >
                      {new Intl.DateTimeFormat("da-DK", {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(message.created_at))}
                    </p>
                  </div>
                </li>
              );
            })
          )}
        </ul>

        <form onSubmit={(event) => void handleSend(event)} className="mt-6 space-y-2">
          <label className="sr-only" htmlFor="direct-message">
            Besked
          </label>
          <textarea
            id="direct-message"
            required
            maxLength={1000}
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="w-full rounded-2xl border border-line/15 bg-court-mid px-4 py-3 text-base outline-none focus:border-ball"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-full bg-ball px-5 py-3 text-sm font-semibold text-court disabled:opacity-60"
          >
            {sending ? "Sender…" : "Send"}
          </button>
        </form>

        <Link to="/beskeder" className="mt-8 text-sm font-semibold text-ball">
          Alle samtaler
        </Link>
      </main>
    </SiteShell>
  );
}
