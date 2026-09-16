import { useState } from "react";
import { Link } from "react-router-dom";
import { MatchmakerCourtDiagram } from "./MatchmakerCourtDiagram";
import { MatchmakerRsvpSheet } from "./MatchmakerRsvpSheet";
import { Button } from "./ui/Button";
import { cx } from "./ui/cx";
import {
  formatListingCardTitle,
  listingCourts,
  listingDisplayCourts,
  listingInterestedCount,
  listingInterestedLabel,
  listingNeedCount,
  listingNeedLabel,
  listingIsLive,
  matchIdForCourt,
  type MatchmakerListing,
  type MatchmakerListingMatch,
  type MatchmakerRsvp,
  type MatchmakerRsvpStatus,
} from "../lib/matchmaker";
import { fullName, type PartnerPreview } from "../lib/profile";

export function MatchmakerListingCard({
  listing,
  rsvps,
  courtMatches,
  people,
  ratings,
  userId,
  unread,
  saving,
  onRsvp,
}: {
  listing: MatchmakerListing;
  rsvps: MatchmakerRsvp[];
  courtMatches: MatchmakerListingMatch[];
  people: PartnerPreview[];
  ratings: Map<string, number>;
  userId: string;
  unread: boolean;
  saving: boolean;
  onRsvp: (status: MatchmakerRsvpStatus) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const live = listingIsLive(listing);
  const isLockedSeat =
    listing.host_id === userId || listing.brought_partner_id === userId;
  const isHost = listing.host_id === userId;
  const mine = rsvps.find((row) => row.profile_id === userId);
  const displayCourts = listingDisplayCourts(listing, rsvps);
  const realCourts = listingCourts(listing, rsvps);
  const need = listingNeedCount(displayCourts);
  const interestedCount = listingInterestedCount(listing, rsvps);
  const host = people.find((row) => row.id === listing.host_id);
  const hostName = host ? fullName(host) : "Medlem";
  const title = formatListingCardTitle(listing.starts_at, listing.ends_at);
  const detailHref = `/matchmaker/${listing.id}`;
  const showDeltag = live && !isLockedSeat;
  const going = mine?.status === "going";
  const labeledCourts = displayCourts.length > 1;

  function handleDesktopDeltag() {
    if (going || saving) return;
    onRsvp("going");
  }

  function handleSheetSelect(status: MatchmakerRsvpStatus) {
    if (mine?.status === status) {
      setSheetOpen(false);
      return;
    }
    onRsvp(status);
    setSheetOpen(false);
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line/10 bg-court-mid">
      <Link
        to={detailHref}
        className="block min-w-0 flex-1 px-4 pt-4 touch-manipulation"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-2xl tracking-wide sm:text-[1.75rem]">
              <span className="truncate">{title}</span>
              {unread ? (
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-ball"
                  title="Ulæst chat"
                >
                  <span className="sr-only">Ulæst chat</span>
                </span>
              ) : null}
            </h2>
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
            <MatchmakerCourtDiagram
              key={index}
              slots={slots}
              people={people}
              ratings={ratings}
              label={labeledCourts ? `Bane ${index + 1}` : undefined}
            />
          ))}
        </div>

        {listing.note ? (
          <p className="mt-3 line-clamp-2 text-sm italic text-line/60">
            “{listing.note}”
          </p>
        ) : null}
      </Link>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-4">
        <p className="text-xs font-medium text-line/50">
          {listingInterestedLabel(interestedCount)}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {realCourts.map((court, index) => {
            const courtNumber = index + 1;
            const matchId = matchIdForCourt(courtNumber, courtMatches);
            if (matchId) {
              return (
                <Button
                  key={`match-${courtNumber}`}
                  to={`/kampe/${matchId}`}
                  className="px-4 py-2 text-xs"
                >
                  Åbn kamp
                </Button>
              );
            }
            if (isHost && live && court.length === 4) {
              return (
                <Button
                  key={`create-${courtNumber}`}
                  to={`/kampe/ny?annonce=${listing.id}&bane=${courtNumber}`}
                  className="px-4 py-2 text-xs"
                >
                  Opret kamp
                </Button>
              );
            }
            return null;
          })}
          {showDeltag ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => setSheetOpen(true)}
                className={cx(
                  "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-semibold touch-manipulation lg:hidden disabled:opacity-60",
                  going
                    ? "bg-ball text-court"
                    : mine?.status === "interested"
                      ? "border border-ball/40 text-ball"
                      : "bg-ball text-court",
                )}
              >
                {going
                  ? "Deltager"
                  : mine?.status === "interested"
                    ? "Interesseret"
                    : "Deltag"}
              </button>
              <button
                type="button"
                disabled={saving}
                aria-pressed={going}
                onClick={handleDesktopDeltag}
                className={cx(
                  "hidden min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-semibold touch-manipulation lg:inline-flex disabled:opacity-60",
                  "bg-ball text-court hover:bg-line",
                )}
              >
                {going ? "Deltager" : "Deltag"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <MatchmakerRsvpSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={title}
        current={mine?.status ?? null}
        saving={saving}
        listingHref={detailHref}
        onSelect={handleSheetSelect}
      />
    </article>
  );
}
