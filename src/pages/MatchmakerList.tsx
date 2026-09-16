import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { MatchmakerListingCard } from "../components/MatchmakerListingCard";
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
  listingHasUnreadChat,
  listingIsLive,
  fetchFollowsNewListings,
  setFollowNewListings,
  type MatchmakerListing,
  type MatchmakerListingMatch,
  type MatchmakerRsvp,
  type MatchmakerRsvpStatus,
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
  const [courtMatches, setCourtMatches] = useState<MatchmakerListingMatch[]>(
    [],
  );
  const [people, setPeople] = useState<PartnerPreview[]>([]);
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
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
    const [
      { data: rsvpRows },
      { data: messageRows },
      { data: readRows },
      { data: courtRows },
      followOn,
    ] = await Promise.all([
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
      ids.length
        ? supabase
            .from("matchmaker_listing_matches")
            .select("listing_id, court_number, match_id")
            .in("listing_id", ids)
        : Promise.resolve({ data: [] }),
      fetchFollowsNewListings().catch(() => false),
    ]);
    const nextRsvps = (rsvpRows ?? []) as MatchmakerRsvp[];
    const peopleMap = await fetchMembersByIds([
      user.id,
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
    setCourtMatches((courtRows ?? []) as MatchmakerListingMatch[]);
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
              (readRows ?? []) as Array<{
                listing_id: string;
                last_read_at: string;
              }>,
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

  const header = (
    <PageHeader
      title="Find kamp"
      subtitle="Opslag om at spille — ikke det samme som at finde en fast partner."
      action={
        <Button to="/matchmaker/ny" className="w-full sm:w-fit">
          Opret opslag
        </Button>
      }
    />
  );

  if (loading || !ready) {
    return (
      <SiteShell>
        <Page wide>
          {header}
          <SkeletonRegion>
            <SkeletonCard className="mt-3 flex min-h-14 items-center justify-between gap-4 rounded-2xl px-4 py-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-7 w-12 shrink-0 rounded-full" />
            </SkeletonCard>
            <ul className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[0, 1, 2, 3].map((row) => (
                <li key={row}>
                  <SkeletonCard className="h-80 rounded-[var(--radius-card)]" />
                </li>
              ))}
            </ul>
          </SkeletonRegion>
        </Page>
      </SiteShell>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  const currentUser = user;

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

  function applyRsvp(listingId: string, status: MatchmakerRsvpStatus) {
    const now = new Date().toISOString();
    setRsvps((prev) => {
      const others = prev.filter(
        (row) =>
          !(row.listing_id === listingId && row.profile_id === currentUser.id),
      );
      return [
        ...others,
        {
          listing_id: listingId,
          profile_id: currentUser.id,
          status,
          created_at:
            prev.find(
              (row) =>
                row.listing_id === listingId &&
                row.profile_id === currentUser.id,
            )?.created_at ?? now,
          updated_at: now,
        },
      ];
    });
  }

  async function setRsvp(listingId: string, status: MatchmakerRsvpStatus) {
    setError(null);
    setSavingId(listingId);
    applyRsvp(listingId, status);
    const { error: rsvpError } = await supabase.rpc("set_matchmaker_rsvp", {
      p_listing_id: listingId,
      p_status: status,
    });
    setSavingId(null);
    if (rsvpError) {
      setError(danishAuthError(rsvpError.message));
      await load();
      return;
    }
    await load();
  }

  return (
    <SiteShell>
      <Page wide>
        {header}
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
        {listings.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-line/10 bg-court-mid px-4 py-4 text-sm text-line/60">
            Ingen åbne opslag lige nu.
          </p>
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {listings.map((listing) => {
              const listingRsvps = rsvps.filter(
                (row) => row.listing_id === listing.id,
              );
              const listingCourtsMatches = courtMatches.filter(
                (row) => row.listing_id === listing.id,
              );
              return (
                <li key={listing.id} className="min-w-0">
                  <MatchmakerListingCard
                    listing={listing}
                    rsvps={listingRsvps}
                    courtMatches={listingCourtsMatches}
                    people={people}
                    ratings={ratings}
                    userId={user.id}
                    unread={unreadIds.has(listing.id)}
                    saving={savingId === listing.id}
                    onRsvp={(status) => void setRsvp(listing.id, status)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Page>
    </SiteShell>
  );
}
