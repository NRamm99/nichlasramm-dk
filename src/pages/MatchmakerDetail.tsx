import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChatComposer, ChatThread } from "../components/ChatThread";
import { SiteShell } from "../components/SiteShell";
import { Page, PageStatus } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  canChat,
  formatListingWindow,
  listingCourts,
  listingGoingIds,
  listingIsLive,
  listingOccupied,
  listingOccupancyLabel,
  matchIdForCourt,
  personLabel,
  type MatchmakerListing,
  type MatchmakerListingMatch,
  type MatchmakerMessage,
  type MatchmakerRsvp,
  type MatchmakerRsvpStatus,
} from "../lib/matchmaker";
import { fetchMembersByIds, fullName, type PartnerPreview } from "../lib/profile";
import { formatMatchWhen } from "../lib/match";
import { supabase } from "../lib/supabase";

export function MatchmakerDetail() {
  const { listingId } = useParams();
  const { user, loading } = useAuth();
  const [listing, setListing] = useState<MatchmakerListing | null>(null);
  const [rsvps, setRsvps] = useState<MatchmakerRsvp[]>([]);
  const [courtMatches, setCourtMatches] = useState<MatchmakerListingMatch[]>([]);
  const [messages, setMessages] = useState<MatchmakerMessage[]>([]);
  const [people, setPeople] = useState<PartnerPreview[]>([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState(0);
  const [body, setBody] = useState("");

  const load = useCallback(async () => {
    if (!listingId || !user) return;
    const [{ data: row }, { data: rsvpRows }, { data: messageRows }, { data: courtRows }] =
      await Promise.all([
        supabase.from("matchmaker_listings").select("*").eq("id", listingId).maybeSingle(),
        supabase.from("matchmaker_rsvps").select("*").eq("listing_id", listingId),
        supabase
          .from("matchmaker_listing_messages")
          .select("*")
          .eq("listing_id", listingId)
          .order("created_at"),
        supabase
          .from("matchmaker_listing_matches")
          .select("listing_id, court_number, match_id")
          .eq("listing_id", listingId),
      ]);
    if (!row) {
      setMissing(true);
      return;
    }
    const next = row as MatchmakerListing;
    const nextRsvps = (rsvpRows ?? []) as MatchmakerRsvp[];
    setListing(next);
    setRsvps(nextRsvps);
    setCourtMatches((courtRows ?? []) as MatchmakerListingMatch[]);
    setMessages((messageRows ?? []) as MatchmakerMessage[]);
    const peopleMap = await fetchMembersByIds([
      next.host_id,
      next.brought_partner_id,
      ...nextRsvps.map((item) => item.profile_id),
      ...((messageRows ?? []) as MatchmakerMessage[]).map((item) => item.author_id),
    ]);
    setPeople([...peopleMap.values()]);
    if (canChat(next, nextRsvps, user.id)) {
      await supabase.rpc("mark_matchmaker_listing_read", {
        p_listing_id: listingId,
      });
    }
  }, [listingId, user]);

  useEffect(() => {
    if (!loading && user) void load();
  }, [load, loading, user]);

  if (loading) {
    return (
      <SiteShell>
        <PageStatus>Indlæser…</PageStatus>
      </SiteShell>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (missing) {
    return (
      <SiteShell>
        <Page>
          <h1 className="font-display text-5xl">Ikke fundet</h1>
          <Link to="/matchmaker" className="mt-4 inline-block text-sm font-semibold text-ball">
            Tilbage
          </Link>
        </Page>
      </SiteShell>
    );
  }
  if (!listing) {
    return (
      <SiteShell>
        <PageStatus>Indlæser…</PageStatus>
      </SiteShell>
    );
  }

  const live = listingIsLive(listing);
  const occupied = listingOccupied(listing, rsvps);
  const courts = listingCourts(listing, rsvps);
  const assignedIds = new Set(
    courtMatches.flatMap((row) => courts[row.court_number - 1] ?? []),
  );
  const isHost = listing.host_id === user.id;
  const isLockedSeat =
    isHost || listing.brought_partner_id === user.id;
  const mine = rsvps.find((row) => row.profile_id === user.id);
  const interested = rsvps.filter((row) => row.status === "interested");
  const declined = rsvps.filter((row) => row.status === "declined");
  const chatOk = canChat(listing, rsvps, user.id);

  async function setRsvp(status: MatchmakerRsvpStatus) {
    if (!listingId) return;
    setError(null);
    setSaving(true);
    const { error: rsvpError } = await supabase.rpc("set_matchmaker_rsvp", {
      p_listing_id: listingId,
      p_status: status,
    });
    setSaving(false);
    if (rsvpError) {
      setError(danishAuthError(rsvpError.message));
      return;
    }
    await load();
  }

  async function handleClose() {
    if (!listingId) return;
    setError(null);
    setSaving(true);
    const { error: closeError } = await supabase.rpc("close_matchmaker_listing", {
      p_listing_id: listingId,
    });
    setSaving(false);
    if (closeError) {
      setError(danishAuthError(closeError.message));
      return;
    }
    await load();
  }

  async function handleRemove(profileId: string) {
    if (!listingId) return;
    setError(null);
    setSaving(true);
    const { error: removeError } = await supabase.rpc("remove_matchmaker_player", {
      p_listing_id: listingId,
      p_profile_id: profileId,
    });
    setSaving(false);
    if (removeError) {
      setError(danishAuthError(removeError.message));
      return;
    }
    await load();
  }

  async function handleSend() {
    if (!listingId) return;
    setError(null);
    setSaving(true);
    const { error: sendError } = await supabase.rpc("add_matchmaker_message", {
      p_listing_id: listingId,
      p_body: body,
    });
    setSaving(false);
    if (sendError) {
      setError(danishAuthError(sendError.message));
      return;
    }
    setBody("");
    setPin((value) => value + 1);
    await load();
  }

  return (
    <SiteShell>
      <Page>
        <Link to="/matchmaker" className="text-sm font-semibold text-ball">
          Find kamp
        </Link>
        <h1 className="mt-2 font-display text-5xl tracking-wide">
          {personLabel(listing.host_id, people)}
        </h1>
        <p className="mt-2 text-sm text-line/70">
          {formatListingWindow(listing.starts_at, listing.ends_at)}
          {listing.location ? ` · ${listing.location}` : ""}
        </p>
        <p className="mt-1 text-sm font-semibold text-ball">
          {listingOccupancyLabel(occupied)}
        </p>
        {listing.note ? (
          <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-court px-4 py-3 text-sm text-line/85">
            {listing.note}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        {listing.converted_match_id ? (
          <Link
            to={`/kampe/${listing.converted_match_id}`}
            className="mt-4 rounded-full bg-ball px-4 py-2.5 text-center text-xs font-semibold text-court"
          >
            Åbn den planlagte kamp
          </Link>
        ) : null}

        {live && !isLockedSeat ? (
          <div className="mt-6 grid grid-cols-3 gap-2">
            <RsvpButton
              label="Deltager"
              active={mine?.status === "going"}
              disabled={saving}
              onClick={() => void setRsvp("going")}
            />
            <RsvpButton
              label="Interesseret"
              active={mine?.status === "interested"}
              disabled={saving}
              onClick={() => void setRsvp("interested")}
            />
            <RsvpButton
              label="Kan ikke"
              active={mine?.status === "declined"}
              disabled={saving}
              onClick={() => void setRsvp("declined")}
            />
          </div>
        ) : null}

        <section className="mt-8 space-y-5">
          {courts.map((court, index) => {
            const courtNumber = index + 1;
            const matchId = matchIdForCourt(courtNumber, courtMatches);
            const roleFor = (id: string) => {
              if (id === listing.host_id) return " · vært";
              if (id === listing.brought_partner_id) return " · makker";
              return "";
            };
            return (
              <div key={courtNumber}>
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
                  Bane {courtNumber} · {court.length}/4
                </h2>
                <ul className="mt-2 space-y-2 text-sm">
                  {court.length === 0 ? (
                    <li className="text-line/55">Ingen deltagere endnu.</li>
                  ) : (
                    court.map((id) => (
                      <li key={id} className="flex items-center justify-between gap-2">
                        <span>
                          {personLabel(id, people)}
                          {roleFor(id)}
                        </span>
                        {isHost &&
                        live &&
                        id !== listing.host_id &&
                        id !== listing.brought_partner_id &&
                        !assignedIds.has(id) ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleRemove(id)}
                            className="text-xs font-semibold text-red-300"
                          >
                            Fjern
                          </button>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
                {matchId ? (
                  <Link
                    to={`/kampe/${matchId}`}
                    className="mt-3 inline-block text-sm font-semibold text-ball"
                  >
                    Åbn kamp
                  </Link>
                ) : isHost && live && court.length === 4 ? (
                  <Link
                    to={`/kampe/ny?annonce=${listing.id}&bane=${courtNumber}`}
                    className="mt-3 inline-block rounded-full bg-ball px-4 py-2.5 text-center text-xs font-semibold text-court"
                  >
                    Opret kamp
                  </Link>
                ) : null}
              </div>
            );
          })}
        </section>

        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
            Interesseret
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-line/75">
            {interested.length === 0 ? (
              <li>Ingen endnu.</li>
            ) : (
              interested.map((row) => (
                <li key={row.profile_id}>{personLabel(row.profile_id, people)}</li>
              ))
            )}
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
            Kan ikke
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-line/75">
            {declined.length === 0 ? (
              <li>Ingen endnu.</li>
            ) : (
              declined.map((row) => (
                <li key={row.profile_id}>{personLabel(row.profile_id, people)}</li>
              ))
            )}
          </ul>
        </section>

        {isHost && live ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleClose()}
            className="mt-3 rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
          >
            Luk annonce
          </button>
        ) : null}

        <section className="mt-8 overflow-hidden rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-6">
          <h2 className="font-display text-3xl tracking-wide">Chat</h2>
          <div className="mt-4">
            <ChatThread
              scrollKey={`${messages.length}:${messages[messages.length - 1]?.id ?? "empty"}`}
              pin={pin}
              footer={
                chatOk ? (
                  <ChatComposer
                    id="listing-chat"
                    value={body}
                    onChange={setBody}
                    onSubmit={() => void handleSend()}
                    sending={saving}
                    placeholder="Skriv til de andre…"
                  />
                ) : (
                  <p className="text-xs text-line/50">
                    {listingGoingIds(listing, rsvps).includes(user.id) ||
                    mine?.status === "interested" ||
                    isLockedSeat
                      ? "Chatten er lukket."
                      : "Svar Deltager eller Interesseret for at skrive."}
                  </p>
                )
              }
            >
              <ul className="space-y-3">
                {messages.length === 0 ? (
                  <li className="text-sm text-line/60">Ingen beskeder endnu.</li>
                ) : (
                  messages.map((message) => {
                    const author = people.find((row) => row.id === message.author_id);
                    return (
                      <li
                        key={message.id}
                        className="rounded-2xl bg-court/60 px-4 py-3"
                      >
                        <p className="text-xs text-line/50">
                          {author ? fullName(author) : "Medlem"} ·{" "}
                          {formatMatchWhen(message.created_at)}
                        </p>
                        <p className="mt-1 text-sm text-line/85 whitespace-pre-wrap">
                          {message.body}
                        </p>
                      </li>
                    );
                  })
                )}
              </ul>
            </ChatThread>
          </div>
        </section>
      </Page>
    </SiteShell>
  );
}

function RsvpButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl px-2 py-3 text-xs font-semibold disabled:opacity-50 ${
        active
          ? "bg-ball text-court"
          : "border border-line/20 bg-court-mid"
      }`}
    >
      {label}
    </button>
  );
}
