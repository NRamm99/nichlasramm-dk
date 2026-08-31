import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  canChat,
  formatListingWindow,
  listingGoingIds,
  listingIsLive,
  listingOccupied,
  personLabel,
  type MatchmakerListing,
  type MatchmakerMessage,
  type MatchmakerRsvp,
  type MatchmakerRsvpStatus,
} from "../lib/matchmaker";
import { fetchMembersByIds, fullName, type PartnerPreview } from "../lib/profile";
import { supabase } from "../lib/supabase";

export function MatchmakerDetail() {
  const { listingId } = useParams();
  const { user, loading } = useAuth();
  const [listing, setListing] = useState<MatchmakerListing | null>(null);
  const [rsvps, setRsvps] = useState<MatchmakerRsvp[]>([]);
  const [messages, setMessages] = useState<MatchmakerMessage[]>([]);
  const [people, setPeople] = useState<PartnerPreview[]>([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [body, setBody] = useState("");

  const load = useCallback(async () => {
    if (!listingId || !user) return;
    const [{ data: row }, { data: rsvpRows }, { data: messageRows }] =
      await Promise.all([
        supabase.from("matchmaker_listings").select("*").eq("id", listingId).maybeSingle(),
        supabase.from("matchmaker_rsvps").select("*").eq("listing_id", listingId),
        supabase
          .from("matchmaker_listing_messages")
          .select("*")
          .eq("listing_id", listingId)
          .order("created_at"),
      ]);
    if (!row) {
      setMissing(true);
      return;
    }
    const next = row as MatchmakerListing;
    const nextRsvps = (rsvpRows ?? []) as MatchmakerRsvp[];
    setListing(next);
    setRsvps(nextRsvps);
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
        <main className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center px-6 text-sm text-line/60">
          Indlæser…
        </main>
      </SiteShell>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (missing) {
    return (
      <SiteShell>
        <main className="mx-auto max-w-xl px-6 py-16">
          <h1 className="font-display text-5xl">Ikke fundet</h1>
          <Link to="/matchmaker" className="mt-4 inline-block text-sm font-semibold text-ball">
            Tilbage
          </Link>
        </main>
      </SiteShell>
    );
  }
  if (!listing) {
    return (
      <SiteShell>
        <main className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center px-6 text-sm text-line/60">
          Indlæser…
        </main>
      </SiteShell>
    );
  }

  const live = listingIsLive(listing);
  const occupied = listingOccupied(listing, rsvps);
  const isHost = listing.host_id === user.id;
  const isLockedSeat =
    isHost || listing.brought_partner_id === user.id;
  const mine = rsvps.find((row) => row.profile_id === user.id);
  const going = rsvps.filter((row) => row.status === "going");
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

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    await load();
  }

  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-4 pb-16 sm:px-6">
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
        <p className="mt-1 text-sm font-semibold text-ball">{occupied}/4 pladser</p>
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
              disabled={saving || (occupied >= 4 && mine?.status !== "going")}
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

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
            Deltager
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            <li>{personLabel(listing.host_id, people)} · vært</li>
            {listing.brought_partner_id ? (
              <li>{personLabel(listing.brought_partner_id, people)} · makker</li>
            ) : null}
            {going.map((row) => (
              <li key={row.profile_id} className="flex items-center justify-between gap-2">
                <span>{personLabel(row.profile_id, people)}</span>
                {isHost && live ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleRemove(row.profile_id)}
                    className="text-xs font-semibold text-red-300"
                  >
                    Fjern
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
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

        {isHost && live && occupied === 4 ? (
          <Link
            to={`/kampe/ny?annonce=${listing.id}`}
            className="mt-6 rounded-full bg-ball px-4 py-2.5 text-center text-xs font-semibold text-court"
          >
            Opret kamp
          </Link>
        ) : null}

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

        <section className="mt-10">
          <h2 className="font-display text-3xl tracking-wide">Chat</h2>
          <ul className="mt-4 space-y-3">
            {messages.length === 0 ? (
              <li className="text-sm text-line/55">Ingen beskeder endnu.</li>
            ) : (
              messages.map((message) => {
                const author = people.find((row) => row.id === message.author_id);
                return (
                  <li key={message.id} className="rounded-2xl bg-court px-4 py-3 text-sm">
                    <p className="text-xs font-semibold text-line/55">
                      {author ? fullName(author) : "Medlem"}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
                  </li>
                );
              })
            )}
          </ul>
          {chatOk ? (
            <form onSubmit={(event) => void handleSend(event)} className="mt-4 space-y-2">
              <textarea
                required
                maxLength={1000}
                rows={3}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="w-full rounded-2xl border border-line/15 bg-court-mid px-4 py-3 text-sm outline-none focus:border-ball"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court disabled:opacity-60"
              >
                Send
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-line/55">
              {listingGoingIds(listing, rsvps).includes(user.id) ||
              mine?.status === "interested" ||
              isLockedSeat
                ? "Chatten er lukket."
                : "Svar Deltager eller Interesseret for at skrive."}
            </p>
          )}
        </section>
      </main>
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
