import { useCallback, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { MatchFinderSheet } from "../components/MatchFinderSheet";
import { MemberAvatar, MemberNameLink } from "../components/MemberAvatar";
import { ProfileEditSheet } from "../components/ProfileEditSheet";
import { ProfileHero, ProfileSeekingBanner } from "../components/ProfileHero";
import { ProfileLeagueCard } from "../components/ProfileLeagueCard";
import { ProfilePartnerCard } from "../components/ProfilePartnerCard";
import { ProfileRecentResults } from "../components/ProfileRecentResults";
import { ProfileSeasonCard } from "../components/ProfileSeasonCard";
import { ProfileTrophyShelf } from "../components/ProfileTrophyShelf";
import { ProfileWeekTimes } from "../components/ProfileWeekTimes";
import { PushNotifications } from "../components/PushNotifications";
import { SiteShell } from "../components/SiteShell";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { BackLink, Page, PageHeader } from "../components/ui/Page";
import {
  Skeleton,
  SkeletonCard,
  SkeletonCircle,
  SkeletonRegion,
} from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import { afterNotificationsRead } from "../lib/appBadge";
import {
  fetchPlayerLeagueCard,
  type PlayerLeagueCard,
} from "../lib/league";
import {
  duoRecordFromMatches,
  emptyDuoRecord,
  emptyPlayerRecord,
  fetchPlayerMatches,
  recordFromPlayerMatches,
  type DuoRecord,
  type MatchCard,
  type PlayerRecord,
} from "../lib/match";
import {
  effectiveSlots,
  emptyMemberPrefs,
  fetchMemberPrefs,
  type MemberPrefs,
} from "../lib/matchFinder";
import { markPartnershipRequestsRead } from "../lib/matchmaker";
import {
  PROFILE_SELECT,
  REQUEST_SELECT,
  attachPartner,
  attachRequestPeople,
  fetchMembersByIds,
  profileDuoMatchesPath,
  profileMatchesPath,
  profilePath,
  type PartnershipRequest,
  type PublicProfile,
} from "../lib/profile";
import {
  emptyRatingSummary,
  fetchPlayerRatingsByIds,
  fetchPlayerRatingSummary,
  type PlayerRating,
  type PlayerRatingSummary,
} from "../lib/rating";
import { supabase } from "../lib/supabase";

function recentPlayedMatches(matches: MatchCard[]) {
  return [...matches]
    .filter((row) => row.status === "played" && row.sets.length > 0)
    .sort(
      (a, b) =>
        new Date(b.played_at).getTime() - new Date(a.played_at).getTime(),
    )
    .slice(0, 3);
}

export function Profile() {
  const { username: usernameParam } = useParams();
  const { user, loading, username: myUsername } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [record, setRecord] = useState<PlayerRecord>(emptyPlayerRecord());
  const [duo, setDuo] = useState<DuoRecord>(emptyDuoRecord());
  const [recentMatches, setRecentMatches] = useState<MatchCard[]>([]);
  const [ratingSummary, setRatingSummary] = useState<PlayerRatingSummary>(
    emptyRatingSummary(),
  );
  const [ratings, setRatings] = useState<Map<string, PlayerRating>>(new Map());
  const [leagueCard, setLeagueCard] = useState<PlayerLeagueCard | null>(null);
  const [incoming, setIncoming] = useState<PartnershipRequest[]>([]);
  const [outgoing, setOutgoing] = useState<PartnershipRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [viewerPartnerId, setViewerPartnerId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [editing, setEditing] = useState(false);
  const [matchFinderPrefs, setMatchFinderPrefs] = useState<MemberPrefs>(
    emptyMemberPrefs,
  );
  const [timesSheetOpen, setTimesSheetOpen] = useState(false);

  const isOwn = Boolean(
    user &&
      (!usernameParam ||
        usernameParam.toLowerCase() === (myUsername ?? "").toLowerCase()),
  );

  const loadMatchFinder = useCallback(async (profileId?: string) => {
    if (!profileId) return;
    try {
      setMatchFinderPrefs(await fetchMemberPrefs(profileId));
    } catch {
      setMatchFinderPrefs(emptyMemberPrefs());
    }
  }, []);

  const load = useCallback(async () => {
    if (!user) return;

    setError(null);
    setMissing(false);

    const { data: me } = await supabase
      .from("profiles")
      .select("partner_id")
      .eq("id", user.id)
      .maybeSingle();
    setViewerPartnerId(me?.partner_id ?? null);

    let query = supabase.from("profiles").select(PROFILE_SELECT);
    if (usernameParam && !isOwn) {
      query = query
        .eq("username", usernameParam.toLowerCase())
        .is("banned_at", null);
    } else {
      query = query.eq("id", user.id);
    }

    const { data, error: loadError } = await query.maybeSingle();
    if (loadError) {
      setError(danishAuthError(loadError.message));
      return;
    }
    if (!data) {
      setMissing(true);
      setProfile(null);
      setRecord(emptyPlayerRecord());
      setDuo(emptyDuoRecord());
      setRecentMatches([]);
      setRatingSummary(emptyRatingSummary());
      setRatings(new Map());
      setLeagueCard(null);
      return;
    }

    void loadMatchFinder(data.id);

    const hideRecord = Boolean(data.hide_record) && !isOwn;
    const [{ data: requestRows }, matches, nextRating, nextLeague] =
      await Promise.all([
        supabase
          .from("partnership_requests")
          .select(REQUEST_SELECT)
          .or(
            isOwn
              ? `requester_id.eq.${user.id},recipient_id.eq.${user.id}`
              : `and(requester_id.eq.${user.id},recipient_id.eq.${data.id}),and(requester_id.eq.${data.id},recipient_id.eq.${user.id})`,
          ),
        hideRecord
          ? Promise.resolve([] as MatchCard[])
          : fetchPlayerMatches(data.id).catch(() => [] as MatchCard[]),
        fetchPlayerRatingSummary(data.id).catch(() => emptyRatingSummary()),
        fetchPlayerLeagueCard(data.id).catch(() => null),
      ]);

    setRecord(
      hideRecord ? emptyPlayerRecord() : recordFromPlayerMatches(data.id, matches),
    );
    setDuo(
      hideRecord || !data.partner_id
        ? emptyDuoRecord()
        : duoRecordFromMatches(data.id, data.partner_id, matches),
    );
    setRecentMatches(hideRecord ? [] : recentPlayedMatches(matches));
    setRatingSummary(nextRating);
    setLeagueCard(nextLeague);

    const peopleIds = [
      data.partner_id,
      ...(requestRows ?? []).flatMap((row) => [
        row.requester_id,
        row.recipient_id,
      ]),
    ];
    const [people, ratingMap] = await Promise.all([
      fetchMembersByIds(peopleIds),
      fetchPlayerRatingsByIds(peopleIds).catch(
        () => new Map<string, PlayerRating>(),
      ),
    ]);
    setRatings(ratingMap);

    const mapped = attachPartner(data, people);
    setProfile(mapped);

    const requests = (requestRows ?? []).map((row) =>
      attachRequestPeople(row, people),
    );
    setIncoming(requests.filter((row) => row.recipient_id === user.id));
    setOutgoing(requests.filter((row) => row.requester_id === user.id));
    if (isOwn) {
      void markPartnershipRequestsRead()
        .then(() => afterNotificationsRead())
        .catch(() => {
          /* Keep the profile usable if the receipt fails. */
        });
    }
  }, [isOwn, loadMatchFinder, user, usernameParam]);

  useEffect(() => {
    if (!loading && user) {
      void load();
    }
  }, [load, loading, user]);

  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  if (loading || (!profile && !missing && !error && user)) {
    return (
      <SiteShell>
        <Page>
          {usernameParam ? <BackLink to="/medlemmer">Medlemmer</BackLink> : null}
          <SkeletonRegion>
            <SkeletonCard className="mt-8 p-5 lg:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                <SkeletonCircle size="7rem" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="mt-3 h-10 w-56 sm:h-14" />
                  <Skeleton className="mt-3 h-4 w-40" />
                </div>
              </div>
            </SkeletonCard>
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(17rem,0.85fr)]">
              <SkeletonCard className="p-5">
                <Skeleton className="h-3 w-20" />
                <div className="mt-4 grid grid-cols-4 gap-2">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              </SkeletonCard>
              <SkeletonCard className="p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-4 h-16 w-full" />
              </SkeletonCard>
            </div>
          </SkeletonRegion>
        </Page>
      </SiteShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (missing) {
    return (
      <SiteShell>
        <Page>
          <BackLink to="/medlemmer">Medlemmer</BackLink>
          <div className="mt-4">
            <PageHeader
              title="Ikke fundet"
              subtitle="Der findes ikke et medlem med det brugernavn."
            />
          </div>
        </Page>
      </SiteShell>
    );
  }

  async function handleHideRecord(hide: boolean) {
    setError(null);
    setProfile((current) =>
      current ? { ...current, hide_record: hide } : current,
    );
    const { error: hideError } = await supabase.rpc("set_hide_record", {
      p_hide: hide,
    });
    if (hideError) {
      setProfile((current) =>
        current ? { ...current, hide_record: !hide } : current,
      );
      setError(danishAuthError(hideError.message));
    }
  }

  async function handleRequest(targetId: string) {
    setError(null);
    setInfo(null);
    const { error: requestError } = await supabase.rpc("request_partnership", {
      p_user_id: targetId,
    });
    if (requestError) {
      setError(danishAuthError(requestError.message));
      return;
    }
    setInfo("Anmodning sendt.");
    await load();
  }

  async function handleAccept(requestId: string) {
    setError(null);
    setInfo(null);
    const { error: acceptError } = await supabase.rpc("accept_partnership", {
      p_request_id: requestId,
    });
    if (acceptError) {
      setError(danishAuthError(acceptError.message));
      return;
    }
    setInfo("I er nu partnere.");
    await load();
  }

  async function handleDecline(requestId: string) {
    setError(null);
    setInfo(null);
    const { error: declineError } = await supabase.rpc("decline_partnership", {
      p_request_id: requestId,
    });
    if (declineError) {
      setError(danishAuthError(declineError.message));
      return;
    }
    setInfo("Anmodningen er afvist.");
    await load();
  }

  async function handleCancel(requestId: string) {
    setError(null);
    setInfo(null);
    const { error: cancelError } = await supabase.rpc(
      "cancel_partnership_request",
      { p_request_id: requestId },
    );
    if (cancelError) {
      setError(danishAuthError(cancelError.message));
      return;
    }
    setInfo("Anmodningen er trukket tilbage.");
    await load();
  }

  async function handleRemovePartner() {
    setError(null);
    setInfo(null);
    const { error: removeError } = await supabase.rpc("remove_partner");
    setConfirmRemove(false);
    if (removeError) {
      setError(danishAuthError(removeError.message));
      return;
    }
    setInfo("Partnerskabet er fjernet.");
    await load();
  }

  async function handleShare() {
    if (!profile) return;
    const url = `${window.location.origin}${profilePath(profile.username) ?? window.location.pathname}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: profile.first_name
            ? `${profile.first_name} på Padel by Ramm`
            : "Padel by Ramm",
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setInfo("Link kopieret.");
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") {
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        setInfo("Link kopieret.");
      } catch {
        setError("Kunne ikke dele profilen.");
      }
    }
  }

  const partner = profile?.partner ?? null;
  const pendingIncoming = incoming[0] ?? null;
  const pendingOutgoing = outgoing[0] ?? null;
  const viewerHasPartner = Boolean(viewerPartnerId);
  const mySlots = effectiveSlots(matchFinderPrefs);
  const showSeeking = Boolean(profile?.seeking_partner && !profile.partner_id);
  const hideRecordFromViewer = Boolean(profile?.hide_record) && !isOwn;

  return (
    <SiteShell>
      <Page>
        {!isOwn ? <BackLink to="/medlemmer">Medlemmer</BackLink> : null}
        {error ? (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="text-sm text-line/70" role="status">
            {info}
          </p>
        ) : null}

        {profile && isOwn && incoming.length > 0 ? (
          <Card className="mt-6 p-5">
            <p className="ui-label">Partnerskabsanmodninger</p>
            <ul className="mt-4 space-y-3">
              {incoming.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    {request.requester ? (
                      <MemberAvatar person={request.requester} size="sm" />
                    ) : null}
                    <div>
                      {request.requester ? (
                        <MemberNameLink
                          person={request.requester}
                          rating={ratings.get(request.requester.id)?.rating}
                        />
                      ) : (
                        <span>Ukendt</span>
                      )}
                      <p className="text-xs text-line/55">vil være din partner</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="text-xs"
                      onClick={() => void handleDecline(request.id)}
                    >
                      Afvis
                    </Button>
                    <Button
                      className="text-xs"
                      onClick={() => void handleAccept(request.id)}
                    >
                      Acceptér
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {profile ? (
          <>
            <div className="mt-4 space-y-4 sm:mt-6 sm:space-y-5">
              <ProfileHero
                profile={profile}
                isOwn={isOwn}
                ratingSummary={ratingSummary}
                league={leagueCard}
                onEdit={isOwn ? () => setEditing(true) : undefined}
                onShare={() => void handleShare()}
              />

              {!isOwn && !partner && !viewerHasPartner ? (
                pendingIncoming ? (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => void handleDecline(pendingIncoming.id)}
                    >
                      Afvis
                    </Button>
                    <Button
                      onClick={() => void handleAccept(pendingIncoming.id)}
                    >
                      Acceptér anmodning
                    </Button>
                  </div>
                ) : pendingOutgoing ? (
                  <Button
                    variant="secondary"
                    onClick={() => void handleCancel(pendingOutgoing.id)}
                  >
                    Annuller anmodning
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    block
                    onClick={() => void handleRequest(profile.id)}
                  >
                    Anmod om partnerskab
                  </Button>
                )
              ) : null}

              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(17rem,0.85fr)] lg:gap-5">
                <div className="space-y-4">
                  <ProfileSeasonCard
                    record={record}
                    matchesTo={
                      profile.username
                        ? profileMatchesPath(profile.username)
                        : undefined
                    }
                    hideFromOthers={Boolean(profile.hide_record)}
                    onHideFromOthersChange={
                      isOwn ? (hide) => void handleHideRecord(hide) : undefined
                    }
                  />
                  <ProfileRecentResults
                    profileId={profile.id}
                    matches={recentMatches}
                    matchesTo={
                      profile.username
                        ? profileMatchesPath(profile.username)
                        : undefined
                    }
                    hidden={hideRecordFromViewer}
                  />
                  <ProfileWeekTimes
                    slots={
                      profile.match_finder_hidden && !isOwn ? [] : mySlots
                    }
                    isOwn={isOwn}
                    onEdit={isOwn ? () => setTimesSheetOpen(true) : undefined}
                  />
                </div>

                <div className="space-y-4">
                  <ProfilePartnerCard
                    person={profile}
                    partner={partner}
                    partnerRating={
                      partner ? ratings.get(partner.id)?.rating : undefined
                    }
                    duo={duo}
                    partneredAt={profile.partnered_at}
                    matchesTo={
                      profile.username && partner?.username
                        ? profileDuoMatchesPath(
                            profile.username,
                            partner.username,
                          )
                        : undefined
                    }
                    hideRecord={Boolean(profile.hide_record)}
                    isOwn={isOwn}
                    confirmRemove={confirmRemove}
                    onConfirmRemove={() => setConfirmRemove(true)}
                    onCancelRemove={() => setConfirmRemove(false)}
                    onRemove={() => void handleRemovePartner()}
                  />
                  {showSeeking ? (
                    <ProfileSeekingBanner
                      note={profile.seeking_note}
                      isOwn={isOwn}
                    />
                  ) : null}
                  <ProfileLeagueCard card={leagueCard} isOwn={isOwn} />
                  <ProfileTrophyShelf trophies={[]} />
                  {isOwn ? <PushNotifications compact /> : null}
                </div>
              </div>
            </div>

            {isOwn ? (
              <>
                <ProfileEditSheet
                  open={editing}
                  onClose={() => setEditing(false)}
                  profile={profile}
                  onSaved={() => load()}
                />
                <MatchFinderSheet
                  open={timesSheetOpen}
                  onClose={() => setTimesSheetOpen(false)}
                  prefs={matchFinderPrefs}
                  hidden={Boolean(profile.match_finder_hidden)}
                  onSaved={() => void loadMatchFinder(profile.id)}
                  onHiddenChange={(hidden) =>
                    setProfile((current) =>
                      current
                        ? { ...current, match_finder_hidden: hidden }
                        : current,
                    )
                  }
                />
              </>
            ) : null}
          </>
        ) : null}
      </Page>
    </SiteShell>
  );
}
