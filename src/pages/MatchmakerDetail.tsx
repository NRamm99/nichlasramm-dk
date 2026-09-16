import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChatComposer, ChatThread } from "../components/ChatThread";
import { MatchmakerCourtDiagram } from "../components/MatchmakerCourtDiagram";
import { MemberAvatar } from "../components/MemberAvatar";
import { SiteShell } from "../components/SiteShell";
import { BackLink, Page } from "../components/ui/Page";
import { Button } from "../components/ui/Button";
import { cx } from "../components/ui/cx";
import {
  Skeleton,
  SkeletonCard,
  SkeletonRegion,
} from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  canChat,
  formatListingCardTitle,
  listingCourts,
  listingDisplayCourts,
  listingGoingIds,
  listingInterestedLabel,
  listingIsLive,
  listingNeedCount,
  listingNeedLabel,
  matchIdForCourt,
  type MatchmakerListing,
  type MatchmakerListingMatch,
  type MatchmakerMessage,
  type MatchmakerRsvp,
  type MatchmakerRsvpStatus,
} from "../lib/matchmaker";
import {
  fetchMembersByIds,
  fullName,
  profilePath,
  type PartnerPreview,
} from "../lib/profile";
import { formatMatchWhen } from "../lib/match";
import {
  fetchPlayerRatingsByIds,
  ratingValues,
  withRating,
} from "../lib/rating";
import { supabase } from "../lib/supabase";

export function MatchmakerDetail() {
  const { listingId } = useParams();
  const { user, loading } = useAuth();
  const [listing, setListing] = useState<MatchmakerListing | null>(null);
  const [rsvps, setRsvps] = useState<MatchmakerRsvp[]>([]);
  const [courtMatches, setCourtMatches] = useState<MatchmakerListingMatch[]>([]);
  const [messages, setMessages] = useState<MatchmakerMessage[]>([]);
  const [people, setPeople] = useState<PartnerPreview[]>([]);
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState(0);
  const [body, setBody] = useState("");
  const [joinConfirmOpen, setJoinConfirmOpen] = useState(false);
  const closeJoinConfirm = useCallback(() => {
    setJoinConfirmOpen(false);
  }, []);

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
    const ratingRows = await fetchPlayerRatingsByIds([
      ...peopleMap.keys(),
    ]).catch(() => new Map());
    setRatings(ratingValues(ratingRows));
    if (canChat(next, nextRsvps, user.id)) {
      await supabase.rpc("mark_matchmaker_listing_read", {
        p_listing_id: listingId,
      });
    }
  }, [listingId, user]);

  useEffect(() => {
    if (!loading && user) void load();
  }, [load, loading, user]);

  if (!loading && !user) return <Navigate to="/login" replace />;

  if (loading || (!listing && !missing)) {
    return (
      <SiteShell>
        <Page wide>
          <BackLink to="/matchmaker">Find kamp</BackLink>
          <SkeletonRegion>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SkeletonCard className="h-[28rem] rounded-[var(--radius-card)]" />
              <SkeletonCard className="h-[28rem] rounded-[var(--radius-card)] p-6">
                <h2 className="font-display text-3xl tracking-wide">Chat</h2>
                <div className="mt-4 space-y-3">
                  <Skeleton className="h-16 w-4/5 rounded-2xl" />
                  <Skeleton className="ml-auto h-16 w-3/5 rounded-2xl" />
                  <Skeleton className="h-14 w-2/3 rounded-2xl" />
                </div>
              </SkeletonCard>
            </div>
          </SkeletonRegion>
        </Page>
      </SiteShell>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (missing) {
    return (
      <SiteShell>
        <Page>
          <h1 className="font-display text-5xl">Ikke fundet</h1>
          <BackLink to="/matchmaker">Find kamp</BackLink>
        </Page>
      </SiteShell>
    );
  }
  if (!listing) {
    return (
      <SiteShell>
        <Page>
          <BackLink to="/matchmaker">Find kamp</BackLink>
        </Page>
      </SiteShell>
    );
  }

  const liveListing = listing;
  const live = listingIsLive(liveListing);
  const displayCourts = listingDisplayCourts(liveListing, rsvps);
  const realCourts = listingCourts(liveListing, rsvps);
  const need = listingNeedCount(displayCourts);
  const assignedIds = new Set(
    courtMatches.flatMap((row) => realCourts[row.court_number - 1] ?? []),
  );
  const isHost = liveListing.host_id === user.id;
  const isLockedSeat =
    isHost || liveListing.brought_partner_id === user.id;
  const mine = rsvps.find((row) => row.profile_id === user.id);
  const interested = rsvps.filter((row) => row.status === "interested");
  const declined = rsvps.filter((row) => row.status === "declined");
  const chatOk = canChat(liveListing, rsvps, user.id);
  const host = people.find((row) => row.id === liveListing.host_id);
  const hostName = host ? fullName(host) : "Medlem";
  const title = formatListingCardTitle(liveListing.starts_at, liveListing.ends_at);
  const labeledCourts = displayCourts.length > 1;
  const canJoinEmptySlot = live && !isLockedSeat && mine?.status !== "going";

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

  async function confirmJoin() {
    await setRsvp("going");
    setJoinConfirmOpen(false);
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

  function extrasForPerson(id: string) {
    const badge =
      id === liveListing.host_id
        ? "Vært"
        : id === liveListing.brought_partner_id
          ? "Makker"
          : undefined;
    const canRemove =
      isHost &&
      live &&
      id !== liveListing.host_id &&
      id !== liveListing.brought_partner_id &&
      !assignedIds.has(id);
    return {
      badge,
      action: canRemove ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleRemove(id)}
          className="text-[0.65rem] font-semibold text-red-300 touch-manipulation disabled:opacity-50"
        >
          Fjern
        </button>
      ) : undefined,
    };
  }

  return (
    <SiteShell>
      <Page wide>
        <BackLink to="/matchmaker">Find kamp</BackLink>
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
          <article className="overflow-hidden rounded-[var(--radius-card)] border border-line/10 bg-court-mid px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-2xl tracking-wide sm:text-[1.75rem]">
                  {title}
                </h1>
                <p className="mt-1 truncate text-sm text-line/55">
                  {hostName}
                  {listing.location ? ` · ${listing.location}` : ""}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-ball/15 px-2.5 py-1 text-xs font-semibold text-ball">
                {listingNeedLabel(need)}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {displayCourts.map((slots, index) => (
                <div key={index} className="space-y-3">
                  <MatchmakerCourtDiagram
                    slots={slots}
                    people={people}
                    ratings={ratings}
                    label={labeledCourts ? `Bane ${index + 1}` : undefined}
                    hrefForPerson={(person) =>
                      person.username ? profilePath(person.username) : undefined
                    }
                    extrasForPerson={extrasForPerson}
                    onEmptySlotClick={
                      canJoinEmptySlot
                        ? () => setJoinConfirmOpen(true)
                        : undefined
                    }
                    emptySlotDisabled={saving}
                  />
                  {courtAction(index + 1, realCourts[index], listing, courtMatches, isHost, live)}
                </div>
              ))}
            </div>

            {listing.note ? (
              <p className="mt-3 whitespace-pre-wrap text-sm italic text-line/60">
                “{listing.note}”
              </p>
            ) : null}

            {listing.converted_match_id ? (
              <Button
                to={`/kampe/${listing.converted_match_id}`}
                className="mt-4 px-4 py-2 text-xs"
              >
                Åbn den planlagte kamp
              </Button>
            ) : null}

            {live && !isLockedSeat ? (
              <div className="mt-5 grid grid-cols-3 gap-2">
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

            <PeopleSection
              title="Interesseret"
              empty="Ingen endnu."
              hint={listingInterestedLabel(interested.length)}
            >
              {interested.map((row) => (
                <PersonRow
                  key={row.profile_id}
                  person={people.find((item) => item.id === row.profile_id)}
                  rating={ratings.get(row.profile_id)}
                  fallbackId={row.profile_id}
                />
              ))}
            </PeopleSection>

            <PeopleSection title="Kan ikke" empty="Ingen endnu.">
              {declined.map((row) => (
                <PersonRow
                  key={row.profile_id}
                  person={people.find((item) => item.id === row.profile_id)}
                  rating={ratings.get(row.profile_id)}
                  fallbackId={row.profile_id}
                />
              ))}
            </PeopleSection>

            {isHost && live ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleClose()}
                className="mt-5 rounded-full border border-line/20 px-4 py-2 text-xs font-semibold touch-manipulation disabled:opacity-60"
              >
                Luk annonce
              </button>
            ) : null}
          </article>

          <section className="overflow-hidden rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-5 sm:p-6">
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
                            {author
                              ? withRating(
                                  fullName(author),
                                  ratings.get(author.id),
                                )
                              : "Medlem"}{" "}
                            · {formatMatchWhen(message.created_at)}
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
        </div>
      </Page>
      <JoinConfirmDialog
        open={joinConfirmOpen}
        saving={saving}
        onClose={closeJoinConfirm}
        onConfirm={() => void confirmJoin()}
      />
    </SiteShell>
  );
}

function JoinConfirmDialog({
  open,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!saving) onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose, saving]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-court/80 p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-sm rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-6 shadow-xl"
      >
        <h2 id={titleId} className="font-display text-3xl tracking-wide">
          Er du sikker?
        </h2>
        <p id={descriptionId} className="mt-3 text-sm text-line/80">
          Vil du deltage i kampen?
        </p>
        <div className="mt-6 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={saving}
            onClick={onClose}
          >
            Annuller
          </Button>
          <Button
            autoFocus
            className="flex-1"
            disabled={saving}
            onClick={onConfirm}
          >
            {saving ? "Gemmer…" : "Deltag"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function courtAction(
  courtNumber: number,
  court: string[] | undefined,
  listing: MatchmakerListing,
  courtMatches: MatchmakerListingMatch[],
  isHost: boolean,
  live: boolean,
) {
  const matchId = matchIdForCourt(courtNumber, courtMatches);
  if (matchId) {
    return (
      <Button to={`/kampe/${matchId}`} className="px-4 py-2 text-xs">
        Åbn kamp
      </Button>
    );
  }
  if (isHost && live && court?.length === 4) {
    return (
      <Button
        to={`/kampe/ny?annonce=${listing.id}&bane=${courtNumber}`}
        className="px-4 py-2 text-xs"
      >
        Opret kamp
      </Button>
    );
  }
  return null;
}

function PeopleSection({
  title,
  empty,
  hint,
  children,
}: {
  title: string;
  empty: string;
  hint?: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children : children ? [children] : [];
  const hasItems = items.filter(Boolean).length > 0;
  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-line/45">
          {title}
        </h2>
        {hint && hasItems ? (
          <p className="text-xs font-medium text-line/45">{hint}</p>
        ) : null}
      </div>
      <ul className="mt-2 space-y-1">
        {hasItems ? children : (
          <li className="text-sm text-line/55">{empty}</li>
        )}
      </ul>
    </section>
  );
}

function PersonRow({
  person,
  rating,
  fallbackId,
}: {
  person: PartnerPreview | undefined;
  rating?: number;
  fallbackId: string;
}) {
  const resolved = person ?? {
    id: fallbackId,
    username: null,
    first_name: null,
    last_name: null,
    avatar_url: null,
  };
  const name = fullName(resolved);
  const inner = (
    <>
      <MemberAvatar person={resolved} size="xs" ring="line" />
      <span className="min-w-0 truncate font-semibold">
        {name}
        {rating != null ? (
          <span className="font-normal tabular-nums text-line/45"> ({rating})</span>
        ) : null}
      </span>
    </>
  );
  if (!resolved.username) {
    return (
      <li className="flex items-center gap-3 rounded-2xl px-1 py-1.5 text-sm">
        {inner}
      </li>
    );
  }
  return (
    <li>
      <Link
        to={profilePath(resolved.username)}
        className="flex items-center gap-3 rounded-2xl px-1 py-1.5 text-sm touch-manipulation hover:bg-court/60"
      >
        {inner}
      </Link>
    </li>
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
      className={cx(
        "flex min-h-11 items-center justify-center rounded-full px-2 py-2.5 text-xs font-semibold transition touch-manipulation disabled:opacity-50 sm:text-sm",
        active
          ? "bg-ball text-court hover:bg-line"
          : "border border-line/20 bg-court hover:border-ball hover:text-ball",
      )}
    >
      {label}
    </button>
  );
}
