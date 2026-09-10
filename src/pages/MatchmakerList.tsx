import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { MemberAvatar } from "../components/MemberAvatar";
import { SiteShell } from "../components/SiteShell";
import { Page, PageHeader } from "../components/ui/Page";
import {
  Skeleton,
  SkeletonCard,
  SkeletonRegion,
} from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  formatListingWindow,
  listingHasUnreadChat,
  listingIsLive,
  listingOccupied,
  listingOccupancyLabel,
  listingInterestedCount,
  listingInterestedLabel,
  listingGoingIds,
  personLabel,
  fetchFollowsNewListings,
  setFollowNewListings,
  type MatchmakerListing,
  type MatchmakerRsvp,
} from "../lib/matchmaker";
import { fetchMembersByIds, type PartnerPreview } from "../lib/profile";
import {
  fetchPlayerRatingsByIds,
  ratingValues,
} from "../lib/rating";
import { supabase } from "../lib/supabase";

export function MatchmakerList() {
  const { user, loading } = useAuth();
  const [listings, setListings] = useState<MatchmakerListing[]>([]);
  const [rsvps, setRsvps] = useState<MatchmakerRsvp[]>([]);
  const [people, setPeople] = useState<PartnerPreview[]>([]);
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
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
    const [{ data: rsvpRows }, { data: messageRows }, { data: readRows }, followOn] =
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
        fetchFollowsNewListings().catch(() => false),
      ]);
    const nextRsvps = (rsvpRows ?? []) as MatchmakerRsvp[];
    const peopleMap = await fetchMembersByIds([
      ...rows.map((row) => row.host_id),
      ...rows.map((row) => row.brought_partner_id),
      ...nextRsvps
        .filter((row) => row.status === "going")
        .map((row) => row.profile_id),
    ]);
    const ratingRows = await fetchPlayerRatingsByIds([
      ...peopleMap.keys(),
    ]).catch(() => new Map());
    setListings(rows.filter(listingIsLive));
    setRsvps(nextRsvps);
    setPeople([...peopleMap.values()]);
    setRatings(ratingValues(ratingRows));
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
    setFollowing(followOn);
    setReady(true);
  }, [user]);

  useEffect(() => {
    if (!loading && user) void load();
  }, [load, loading, user]);

  if (!loading && !user) return <Navigate to="/login" replace />;

  if (loading || !ready) {
    return (
      <SiteShell>
        <Page>
          <PageHeader
            title="Find kamp"
            subtitle="Opslag om at spille — ikke det samme som at finde en fast partner."
            action={
              <Button to="/matchmaker/ny" className="w-full sm:w-fit">
                Opret annonce
              </Button>
            }
          />
          <SkeletonRegion>
            <SkeletonCard className="mt-3 flex min-h-14 items-center justify-between gap-4 rounded-2xl px-4 py-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-7 w-12 shrink-0 rounded-full" />
            </SkeletonCard>
            <ul className="mt-6 space-y-2">
              {[0, 1, 2, 3].map((row) => (
                <li key={row}>
                  <SkeletonCard className="flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 py-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-3 w-16" />
                  </SkeletonCard>
                </li>
              ))}
            </ul>
          </SkeletonRegion>
        </Page>
      </SiteShell>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  async function toggleFollow() {
    const next = !following;
    setFollowBusy(true);
    setError(null);
    setFollowing(next);
    try {
      await setFollowNewListings(next);
    } catch (toggleError) {
      setFollowing(!next);
      setError(danishAuthError((toggleError as Error).message));
    }
    setFollowBusy(false);
  }

  return (
    <SiteShell>
      <Page>
        <PageHeader
          title="Find kamp"
          subtitle="Opslag om at spille — ikke det samme som at finde en fast partner."
          action={
            <Button to="/matchmaker/ny" className="w-full sm:w-fit">
              Opret annonce
            </Button>
          }
        />
        <button
          type="button"
          role="switch"
          aria-checked={following}
          disabled={followBusy}
          onClick={() => void toggleFollow()}
          className="mt-3 flex w-full min-h-14 items-center justify-between gap-4 rounded-2xl border border-line/10 bg-court-mid px-4 py-3 text-left touch-manipulation disabled:opacity-60"
        >
          <span className="min-w-0">
            <span className="block font-semibold">Følg nye kampe</span>
            <span className="mt-0.5 block text-sm text-line/60">
              {following
                ? "Du får besked, når nogen opretter et opslag."
                : "Slå til for at få besked om nye opslag."}
            </span>
          </span>
          <span
            className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition ${
              following ? "bg-ball" : "bg-line/20"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-line shadow transition-transform ${
                following ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </span>
        </button>
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
              const listingRsvps = rsvps.filter(
                (row) => row.listing_id === listing.id,
              );
              const occupied = listingOccupied(listing, listingRsvps);
              const interestedCount = listingInterestedCount(
                listing,
                listingRsvps,
              );
              const going = listingGoingIds(listing, listingRsvps).map((id) => {
                const person = people.find((row) => row.id === id);
                return (
                  person ?? {
                    id,
                    username: null,
                    first_name: null,
                    last_name: null,
                    avatar_url: null,
                  }
                );
              });
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
                        {personLabel(listing.host_id, people, ratings)}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-line/60">
                        {formatListingWindow(listing.starts_at, listing.ends_at)}
                        {listing.location ? ` · ${listing.location}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="flex -space-x-2">
                        {going.slice(0, 5).map((person) => (
                          <MemberAvatar
                            key={person.id}
                            person={person}
                            size="xs"
                          />
                        ))}
                        {going.length > 5 ? (
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-court text-[0.65rem] font-semibold text-line/70 ring-2 ring-court-mid">
                            +{going.length - 5}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="rounded-full bg-ball/15 px-2.5 py-1 text-sm font-semibold text-ball">
                          {listingOccupancyLabel(occupied)}
                        </span>
                        <span className="text-[0.7rem] font-medium text-line/50">
                          {listingInterestedLabel(interestedCount)}
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })
          )}
        </ul>
      </Page>
    </SiteShell>
  );
}
