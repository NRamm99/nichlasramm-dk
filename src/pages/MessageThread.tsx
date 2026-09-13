import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChatComposer, ChatThread } from "../components/ChatThread";
import { MemberAvatar } from "../components/MemberAvatar";
import { SiteShell } from "../components/SiteShell";
import { BackLink, Page } from "../components/ui/Page";
import {
  Skeleton,
  SkeletonCircle,
  SkeletonRegion,
} from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  fetchDirectMessages,
  fetchDirectThread,
  formatMessageDay,
  formatMessageTime,
  markDirectThreadRead,
  otherParticipantId,
  sameCalendarDay,
  sendDirectMessage,
  type DirectMessage,
} from "../lib/messages";
import { fetchMembersByIds, fullName, profilePath } from "../lib/profile";
import {
  fetchPlayerRatingsByIds,
  ratingValues,
  withRating,
} from "../lib/rating";
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
  const [otherRating, setOtherRating] = useState<number | null>(null);
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
      const [rows, people, ratingRows] = await Promise.all([
        fetchDirectMessages(threadId),
        fetchMembersByIds([otherId]),
        fetchPlayerRatingsByIds([otherId]).catch(() => new Map()),
      ]);
      setMessages(rows);
      setOther(people.get(otherId) ?? null);
      setOtherRating(ratingValues(ratingRows).get(otherId) ?? null);
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

  if (!loading && !user) return <Navigate to="/login" replace />;

  if (loading || (!ready && user)) {
    return (
      <SiteShell fill>
        <main className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-4 sm:px-6 lg:max-w-3xl">
          <ThreadBack />
          <div className="flex min-h-0 flex-1 flex-col">
          <SkeletonRegion>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-3 pb-3 pt-1">
                <SkeletonCircle size="2.75rem" />
                <Skeleton className="h-8 w-48 sm:h-10" />
              </div>
              <div className="min-h-0 flex-1 space-y-3 py-2">
                <Skeleton className="h-16 w-[70%] rounded-2xl rounded-bl-md" />
                <Skeleton className="ml-auto h-20 w-[65%] rounded-2xl rounded-br-md" />
                <Skeleton className="h-14 w-[55%] rounded-2xl rounded-bl-md" />
                <Skeleton className="ml-auto h-16 w-[60%] rounded-2xl rounded-br-md" />
              </div>
              <div className="flex items-end gap-2 border-t border-line/10 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Skeleton className="min-h-11 flex-1 rounded-2xl" />
                <Skeleton className="h-11 w-20 shrink-0 rounded-full" />
              </div>
            </div>
          </SkeletonRegion>
          </div>
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
          <BackLink to="/beskeder">Beskeder</BackLink>
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

  const title = other ? withRating(fullName(other), otherRating) : "Besked";
  const lastId = messages[messages.length - 1]?.id ?? "empty";

  return (
    <SiteShell fill>
      <main className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-4 sm:px-6 lg:max-w-3xl">
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
              messages.map((message, index) => {
                const mine = message.author_id === user.id;
                const previous = messages[index - 1];
                const showDay =
                  !previous ||
                  !sameCalendarDay(previous.created_at, message.created_at);
                return (
                  <li key={message.id}>
                    {showDay ? (
                      <p className="py-3 text-center text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-line/40">
                        {formatMessageDay(message.created_at)}
                      </p>
                    ) : null}
                    <div
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
                          {formatMessageTime(message.created_at)}
                        </p>
                      </div>
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
  return <BackLink to="/beskeder">Beskeder</BackLink>;
}
