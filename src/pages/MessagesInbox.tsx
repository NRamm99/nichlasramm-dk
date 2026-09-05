import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ChatBubbleIcon } from "../components/ChatBubbleIcon";
import { MemberAvatar } from "../components/MemberAvatar";
import { SiteShell } from "../components/SiteShell";
import { Button } from "../components/ui/Button";
import { ListEmpty, ListGroup } from "../components/ui/ListGroup";
import { Page, PageHeader, PageStatus } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  fetchDirectInbox,
  formatInboxWhen,
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
        <PageStatus>Indlæser…</PageStatus>
      </SiteShell>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <SiteShell>
      <Page>
        <PageHeader
          eyebrow="Klubben"
          title="Beskeder"
          subtitle="Skriv privat med andre medlemmer. Start en tråd fra medlemslisten eller en profil."
        />
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <ListGroup className="mt-6">
          {rows.length === 0 ? (
            <ListEmpty>
              Ingen samtaler endnu. Åbn et medlem og tryk Send besked.
            </ListEmpty>
          ) : (
            rows.map((row) => {
              const person = names.get(row.other_id);
              const preview = row.last_body?.trim() || "Ingen beskeder endnu.";
              return (
                <li key={row.thread_id}>
                  <Link
                    to={threadPath(row.thread_id)}
                    className="flex min-h-16 items-center gap-3 px-4 py-3 touch-manipulation hover:bg-line/[0.03]"
                  >
                    {person ? (
                      <MemberAvatar person={person} size="sm" />
                    ) : (
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-court text-line/70">
                        <ChatBubbleIcon />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-semibold">
                          {person ? fullName(person) : "Medlem"}
                        </span>
                        <span className="shrink-0 text-xs text-line/45">
                          {formatInboxWhen(row.last_message_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-line/55">
                        {preview}
                      </span>
                    </span>
                    {row.unread ? (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ball" />
                    ) : null}
                  </Link>
                </li>
              );
            })
          )}
        </ListGroup>
        <Button variant="ghost" to="/medlemmer" className="mt-8">
          Find et medlem
        </Button>
      </Page>
    </SiteShell>
  );
}
