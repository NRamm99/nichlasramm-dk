import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  formatListingWindow,
  listingHasUnreadChat,
  listingIsLive,
  listingOccupied,
  personLabel,
  type MatchmakerListing,
  type MatchmakerRsvp,
} from "../lib/matchmaker";
import { fetchMembersByIds, type PartnerPreview } from "../lib/profile";
import { supabase } from "../lib/supabase";

export function MatchmakerList() {
  const { user, loading } = useAuth();
  const [listings, setListings] = useState<MatchmakerListing[]>([]);
  const [rsvps, setRsvps] = useState<MatchmakerRsvp[]>([]);
  const [people, setPeople] = useState<PartnerPreview[]>([]);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: listingRows, error: listError } = await supabase
      .from("matchmaker_listings")
      .select("*")
      .eq("status", "open")
      .gt("ends_at", new Date().toISOString())
      .order("starts_at");
    if (listError) {
      setError(danishAuthError(listError.message));
      setReady(true);
      return;
    }
    const rows = (listingRows ?? []) as MatchmakerListing[];
    const ids = rows.map((row) => row.id);
    const [{ data: rsvpRows }, { data: messageRows }, { data: readRows }] =
      await Promise.all([
        ids.length
          ? supabase.from("matchmaker_rsvps").select("*").in("listing_id", ids)
          : Promise.resolve({ data: [] }),
        ids.length
          ? supabase
              .from("matchmaker_listing_messages")
              .select("listing_id, author_id, created_at")
              .in("listing_id", ids)
          : Promise.resolve({ data: [] }),
        ids.length
          ? supabase
              .from("matchmaker_listing_reads")
              .select("listing_id, last_read_at")
              .eq("profile_id", user.id)
              .in("listing_id", ids)
          : Promise.resolve({ data: [] }),
      ]);
    const nextRsvps = (rsvpRows ?? []) as MatchmakerRsvp[];
    const peopleMap = await fetchMembersByIds([
      ...rows.map((row) => row.host_id),
      ...rows.map((row) => row.brought_partner_id),
    ]);
    setListings(rows.filter(listingIsLive));
    setRsvps(nextRsvps);
    setPeople([...peopleMap.values()]);
    setUnreadIds(
      new Set(
        rows
          .filter((row) =>
            listingHasUnreadChat(
              row.id,
              user.id,
              (messageRows ?? []) as Array<{
                listing_id: string;
                author_id: string;
                created_at: string;
              }>,
              (readRows ?? []) as Array<{ listing_id: string; last_read_at: string }>,
            ),
          )
          .map((row) => row.id),
      ),
    );
    setReady(true);
  }, [user]);

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
        <h1 className="font-display text-5xl tracking-wide sm:text-6xl">
          Find kamp
        </h1>
        <p className="mt-2 text-sm text-line/65">
          Opslag om at spille — ikke det samme som at finde en fast partner.
        </p>
        <Link
          to="/matchmaker/ny"
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-ball px-4 py-2.5 text-xs font-semibold text-court sm:w-auto"
        >
          Opret annonce
        </Link>
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="mt-6 space-y-2">
          {listings.length === 0 ? (
            <li className="rounded-2xl border border-line/10 bg-court-mid px-4 py-4 text-sm text-line/60">
              Ingen åbne opslag lige nu.
            </li>
          ) : (
            listings.map((listing) => {
              const occupied = listingOccupied(
                listing,
                rsvps.filter((row) => row.listing_id === listing.id),
              );
              return (
                <li key={listing.id}>
                  <Link
                    to={`/matchmaker/${listing.id}`}
                    className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl border bg-court-mid px-4 py-3 touch-manipulation ${
                      unreadIds.has(listing.id)
                        ? "border-ball/50"
                        : "border-line/10"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {personLabel(listing.host_id, people)}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-line/60">
                        {formatListingWindow(listing.starts_at, listing.ends_at)}
                        {listing.location ? ` · ${listing.location}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-ball/15 px-2.5 py-1 text-sm font-semibold text-ball">
                      {occupied}/4
                    </span>
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      </main>
    </SiteShell>
  );
}
