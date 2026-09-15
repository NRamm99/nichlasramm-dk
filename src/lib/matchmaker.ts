import { fixtureHasUnread } from "./league";
import { fullName, type PartnerPreview } from "./profile";
import { withRating } from "./rating";
import { supabase } from "./supabase";

export type MatchmakerStatus = "open" | "closed" | "converted";
export type MatchmakerRsvpStatus = "going" | "interested" | "declined";

export type MatchmakerListing = {
  id: string;
  created_at: string;
  host_id: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  note: string | null;
  host_seats: 1 | 2;
  brought_partner_id: string | null;
  status: MatchmakerStatus;
  converted_match_id: string | null;
};

export type MatchmakerRsvp = {
  listing_id: string;
  profile_id: string;
  status: MatchmakerRsvpStatus;
  created_at: string;
  updated_at: string;
};

export type MatchmakerMessage = {
  id: string;
  listing_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type AppNotification = {
  id: string;
  kind: string;
  payload: {
    href?: string;
    listing_id?: string;
    match_id?: string;
    thread_id?: string;
    body?: string;
    from?: string;
  };
  created_at: string;
  read_at: string | null;
};

export function listingIsLive(listing: MatchmakerListing) {
  return listing.status === "open" && new Date(listing.ends_at).getTime() > Date.now();
}

export type MatchmakerListingMatch = {
  listing_id: string;
  court_number: number;
  match_id: string;
};

export function listingOccupied(
  listing: MatchmakerListing,
  rsvps: MatchmakerRsvp[],
) {
  const extra = rsvps.filter(
    (row) =>
      row.status === "going" &&
      row.profile_id !== listing.host_id &&
      row.profile_id !== listing.brought_partner_id,
  ).length;
  return listing.host_seats + extra;
}

export function listingGoingIds(
  listing: MatchmakerListing,
  rsvps: MatchmakerRsvp[],
) {
  const ids = [listing.host_id];
  if (listing.brought_partner_id) ids.push(listing.brought_partner_id);
  const extras = rsvps
    .filter(
      (row) => row.status === "going" && !ids.includes(row.profile_id),
    )
    .sort((a, b) =>
      a.created_at === b.created_at
        ? a.profile_id.localeCompare(b.profile_id)
        : a.created_at.localeCompare(b.created_at),
    );
  return [...ids, ...extras.map((row) => row.profile_id)];
}

export function listingCourts(
  listing: MatchmakerListing,
  rsvps: MatchmakerRsvp[],
) {
  const ids = listingGoingIds(listing, rsvps);
  const courts: string[][] = [];
  for (let i = 0; i < ids.length; i += 4) {
    courts.push(ids.slice(i, i + 4));
  }
  if (courts.length === 0) courts.push([]);
  return courts;
}

export function listingOccupancyLabel(occupied: number) {
  if (occupied <= 4) return `${occupied}/4`;
  const courts = Math.ceil(occupied / 4);
  const last = occupied % 4 === 0 ? 4 : occupied % 4;
  return `${occupied} · bane ${courts} (${last}/4)`;
}

export function listingInterestedCount(
  listing: MatchmakerListing,
  rsvps: MatchmakerRsvp[],
) {
  return rsvps.filter(
    (row) =>
      row.status === "interested" &&
      row.profile_id !== listing.host_id &&
      row.profile_id !== listing.brought_partner_id,
  ).length;
}

export function listingInterestedLabel(count: number) {
  return count === 1 ? "1 interesseret" : `${count} interesserede`;
}

export function matchIdForCourt(
  courtNumber: number,
  rows: MatchmakerListingMatch[],
) {
  return rows.find((row) => row.court_number === courtNumber)?.match_id;
}

export function canChat(
  listing: MatchmakerListing,
  rsvps: MatchmakerRsvp[],
  userId: string,
) {
  if (!listingIsLive(listing)) return false;
  if (userId === listing.host_id || userId === listing.brought_partner_id) {
    return true;
  }
  const mine = rsvps.find((row) => row.profile_id === userId);
  return mine?.status === "going" || mine?.status === "interested";
}

export function formatListingWindow(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const day = new Intl.DateTimeFormat("da-DK", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(start);
  const time = new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day} · ${time.format(start)}–${time.format(end)}`;
}

export function notificationCopy(row: AppNotification) {
  switch (row.kind) {
    case "matchmaker_rsvp":
      return "Nyt svar på en find-kamp-annonce.";
    case "matchmaker_removed":
      return "Du blev fjernet fra en find-kamp-annonce.";
    case "matchmaker_closed":
      return "En find-kamp-annonce blev lukket.";
    case "matchmaker_converted":
      return "En find-kamp-annonce blev til en planlagt kamp.";
    case "matchmaker_listing": {
      const from = row.payload?.from;
      if (typeof from === "string" && from.trim()) {
        return `${from.trim()} søger kamp!`;
      }
      return "Nogen søger kamp!";
    }
    case "matchmaker_message":
      return "Ny besked i en find-kamp-tråd.";
    case "partnership_request":
      return "Du har fået en partnerskabsanmodning.";
    case "match_comment":
      return "Ny kommentar på en kamp.";
    case "match_result_correction":
      return "Der er uenighed om et kampresultat.";
    case "league_join_request":
      return "Du har fået en liga-anmodning.";
    case "league_message":
      return "Ny besked i en ligadialog.";
    case "admin_broadcast": {
      const body = row.payload?.body;
      if (typeof body === "string" && body.trim()) return body.trim();
      return "Besked fra klubben.";
    }
    case "direct_message": {
      const from = row.payload?.from;
      const body = row.payload?.body;
      if (typeof from === "string" && from.trim() && typeof body === "string" && body.trim()) {
        return `${from.trim()}: ${body.trim()}`;
      }
      if (typeof from === "string" && from.trim()) {
        return `Ny besked fra ${from.trim()}`;
      }
      if (typeof body === "string" && body.trim()) {
        return `Ny besked: ${body.trim()}`;
      }
      return "Ny privatbesked.";
    }
    default:
      return "Noget nyt i klubben.";
  }
}

export function notificationHref(row: AppNotification) {
  const href = row.payload?.href;
  if (typeof href === "string" && href.startsWith("/")) return href;
  return "/";
}

export async function fetchFollowsNewListings() {
  const { data, error } = await supabase
    .from("matchmaker_listing_follows")
    .select("profile_id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.profile_id);
}

export async function setFollowNewListings(follow: boolean) {
  const { data, error } = await supabase.rpc("set_follow_new_listings", {
    p_follow: follow,
  });
  if (error) throw error;
  return Boolean(data);
}

const UNREAD_NOTIFICATIONS_EVENT = "padel:unread-notifications";

export function onUnreadNotificationsChanged(listener: () => void) {
  window.addEventListener(UNREAD_NOTIFICATIONS_EVENT, listener);
  return () => window.removeEventListener(UNREAD_NOTIFICATIONS_EVENT, listener);
}

export function notifyUnreadNotificationsChanged() {
  window.dispatchEvent(new Event(UNREAD_NOTIFICATIONS_EVENT));
}

export async function fetchUnreadNotificationCount() {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markMatchCommentsRead(matchId: string) {
  const { error } = await supabase.rpc("mark_match_comments_read", {
    p_match_id: matchId,
  });
  if (error) throw error;
  notifyUnreadNotificationsChanged();
}

export function listingHasUnreadChat(
  listingId: string,
  userId: string,
  messages: Array<{ listing_id: string; author_id: string; created_at: string }>,
  reads: Array<{ listing_id: string; last_read_at: string }>,
) {
  const lastOther = messages
    .filter((row) => row.listing_id === listingId && row.author_id !== userId)
    .reduce<string | undefined>((latest, row) => {
      if (!latest || row.created_at > latest) return row.created_at;
      return latest;
    }, undefined);
  const lastRead = reads.find((row) => row.listing_id === listingId)?.last_read_at;
  return fixtureHasUnread(lastOther, lastRead);
}

export function personLabel(
  id: string | null | undefined,
  people: PartnerPreview[],
  ratings?: Map<string, number>,
) {
  if (!id) return "Ukendt";
  const person = people.find((row) => row.id === id);
  const name = person ? fullName(person) : "Medlem";
  return withRating(name, ratings?.get(id));
}
