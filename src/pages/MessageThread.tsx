import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChatComposer, ChatThread } from "../components/ChatThread";
import { MemberAvatar } from "../components/MemberAvatar";
import { SiteShell } from "../components/SiteShell";
import { Page } from "../components/ui/Page";
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
  const [pin, setPin] = useState(0);

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
      <SiteShell fill>
        <main className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-4 sm:px-6">
          <ThreadBack />
          <p className="flex flex-1 items-center justify-center text-sm text-line/60">
            Indlæser…
          </p>
        </main>
      </SiteShell>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (missing || !threadId) {
    return (
      <SiteShell>
        <Page center>
          <h1 className="font-display text-5xl">Ikke fundet</h1>
          <p className="mt-2 text-sm text-line/65">
            Samtalen findes ikke, eller du har ikke adgang.
          </p>
          <Link to="/beskeder" className="mt-6 text-sm font-semibold text-ball">
            Tilbage til beskeder
          </Link>
        </Page>
      </SiteShell>
    );
  }

  async function handleSend() {
    if (!threadId) return;
    setError(null);
    setSending(true);
    try {
      await sendDirectMessage(threadId, body);
      setBody("");
      setPin((value) => value + 1);
      await load();
    } catch (sendError) {
      setError(danishAuthError((sendError as Error).message));
    } finally {
      setSending(false);
    }
  }

  const title = other ? fullName(other) : "Besked";
  const lastId = messages[messages.length - 1]?.id ?? "empty";

  return (
    <SiteShell fill>
      <main className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-4 sm:px-6">
        <ChatThread
          fill
          scrollKey={`${messages.length}:${lastId}`}
          pin={pin}
          header={
            <div className="shrink-0 pb-3 pt-1">
              <ThreadBack />
              <div className="mt-3 flex items-center gap-3">
                {other ? <MemberAvatar person={other} size="sm" /> : null}
                <div className="min-w-0">
                  {other?.username ? (
                    <Link
                      to={profilePath(other.username)}
                      className="font-display text-3xl tracking-wide hover:text-ball sm:text-4xl"
                    >
                      {title}
                    </Link>
                  ) : (
                    <h1 className="font-display text-3xl tracking-wide sm:text-4xl">
                      {title}
                    </h1>
                  )}
                </div>
              </div>
              {error ? (
                <p className="mt-2 text-sm text-red-300" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          }
          footer={
            <ChatComposer
              id="direct-message"
              value={body}
              onChange={setBody}
              onSubmit={() => void handleSend()}
              sending={sending}
            />
          }
        >
          <ul className="space-y-2 py-2">
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
        </ChatThread>
      </main>
    </SiteShell>
  );
}

function ThreadBack() {
  return (
    <Link
      to="/beskeder"
      className="inline-flex min-h-11 items-center gap-1.5 py-1 text-sm font-semibold text-ball touch-manipulation"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 5 8 12l7 7" />
      </svg>
      Beskeder
    </Link>
  );
}
