import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AddToCalendarButton } from "../components/AddToCalendarButton";
import { SiteShell } from "../components/SiteShell";
import { HomePoll } from "../components/HomePoll";
import { LeagueFinalsCard } from "../components/LeagueFinalsCard";
import { LeaguePlace } from "../components/LeaguePlace";
import { MatchFinderCard } from "../components/MatchFinderCard";
import { MatchFinderSheet } from "../components/MatchFinderSheet";
import { MemberAvatar, TeamAvatarStack } from "../components/MemberAvatar";
import { PushNotifications } from "../components/PushNotifications";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ListGroup, ListRow } from "../components/ui/ListGroup";
import { Page, PageStatus } from "../components/ui/Page";
import { HomeDashboardSkeleton } from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  fetchHomeDashboard,
  remainingLeagueCopy,
  type HomeDashboard,
} from "../lib/home";
import { groupQualifyMark, leagueHasFinalsPromo } from "../lib/league";
import { MATCH_FINDER_COPY, hasAnyPrefs } from "../lib/matchFinder";
import {
  formatNextMatchWhen,
  isLeagueMatch,
  teamPlayers,
  type MatchPlayer,
} from "../lib/match";
import { shortDisplayName, type PartnerPreview } from "../lib/profile";
import {
  fetchPlayerRatingsByIds,
  ratingValues,
  withRating,
} from "../lib/rating";
import { setAppBadgeCount } from "../lib/appBadge";

export function Landing() {
  const { user, loading, username } = useAuth();

  return (
    <SiteShell>
      {loading ? (
        <PageStatus>Indlæser…</PageStatus>
      ) : user ? (
        <HomeDashboardView userId={user.id} username={username} />
      ) : (
        <GuestLanding />
      )}
    </SiteShell>
  );
}

function GuestLanding() {
  return (
    <Page
      center
      wide
      className="text-center lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:text-left"
    >
      <div className="min-w-0 lg:flex-1">
        <p className="ui-label text-ball">Lukket padelklub</p>
        <h1 className="mt-4 font-display text-[clamp(2.75rem,8vw,6.5rem)] leading-[0.85] tracking-[0.04em]">
          Padel By Ramm
        </h1>
      </div>
      <div className="mt-6 max-w-md lg:mt-0 lg:w-[26rem] lg:shrink-0">
        <p className="text-base text-line/75 sm:text-lg">
          Velkommen til den lokale padel-liga. Log ind, hvis du allerede er
          medlem, eller opret en konto med en invitationskode.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
          <Button variant="secondary" to="/login" className="px-8 py-3">
            Log ind
          </Button>
          <Button to="/register" className="px-8 py-3">
            Opret konto
          </Button>
        </div>
      </div>
    </Page>
  );
}

function HomeDashboardView({
  userId,
  username,
}: {
  userId: string;
  username: string | null;
}) {
  const [data, setData] = useState<HomeDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [timesSheetOpen, setTimesSheetOpen] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const dashboard = await fetchHomeDashboard(userId);
        if (cancelled) return;
        setData(dashboard);
        void setAppBadgeCount(dashboard.unreadNotifications);
        const ratingIds = [
          userId,
          ...dashboard.leagueTable.flatMap((row) =>
            row.players.map((person) => person.id),
          ),
          ...dashboard.leagueTeams.flatMap((team) =>
            team.players.map((person) => person.id),
          ),
          ...dashboard.nextMatchPeople.keys(),
          ...dashboard.matchFinder.people.keys(),
        ];
        const ratingRows = await fetchPlayerRatingsByIds(ratingIds).catch(
          () => new Map(),
        );
        if (!cancelled) setRatings(ratingValues(ratingRows));
      } catch (loadError) {
        if (!cancelled) setError(danishAuthError((loadError as Error).message));
      }
    }

    void loadDashboard();

    function onVisible() {
      if (document.visibilityState === "visible") void loadDashboard();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [userId, reloadTick]);

  const reload = () => setReloadTick((tick) => tick + 1);
  const setMatchFinderHiddenLocal = (hidden: boolean) =>
    setData((current) =>
      current
        ? { ...current, matchFinder: { ...current.matchFinder, hidden } }
        : current,
    );

  if (!data && !error) {
    return (
      <Page>
        <HomeDashboardSkeleton />
      </Page>
    );
  }

  const greeting = data?.firstName || username || "der";
  const leagueHint = !data
    ? undefined
    : data.inLeague
      ? undefined
      : data.leagueInvites > 0
        ? data.leagueInvites === 1
          ? "1 anmodning venter"
          : `${data.leagueInvites} anmodninger venter`
        : data.signupOpen
          ? "Tilmeld jer"
          : undefined;
  const ownNextMatch =
    data?.nextMatch && data.nextMatchIsOwn ? data.nextMatch : null;
  const nextMatchWhen = ownNextMatch
    ? formatNextMatchWhen(ownNextMatch.played_at)
    : null;
  const nextMatchPeople = data?.nextMatchPeople ?? new Map<string, PartnerPreview>();
  const leagueTotal = data?.leagueTotal ?? 0;
  const leaguePlayed = data?.leaguePlayed ?? 0;
  const leagueProgress =
    data?.inLeague && leagueTotal > 0 ? leaguePlayed / leagueTotal : 0;

  return (
    <Page>
      <h1 className="font-display text-4xl tracking-wide sm:text-5xl lg:text-4xl">
        Hej {greeting}
      </h1>
      <p className="mt-1 text-sm text-line/55">Her er status på din klub</p>
      {error ? (
        <p className="mt-4 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      {data?.pendingPoll ? (
        <HomePoll
          poll={data.pendingPoll}
          onDone={() => {
            void fetchHomeDashboard(userId).then(setData);
          }}
        />
      ) : null}

      {data ? (
        <div className="mt-5 empty:mt-0 empty:hidden">
          <PushNotifications hideWhenEnabled compact />
        </div>
      ) : null}

      {data?.currentLeague &&
      leagueHasFinalsPromo(data.currentLeague) ? (
        <div className="mt-6">
          <LeagueFinalsCard
            compact
            league={data.currentLeague}
            teams={data.leagueTeams}
            fixtures={data.leagueFixtures}
            ratings={ratings}
          />
        </div>
      ) : null}

      <div className="mt-6 grid min-w-0 gap-3 lg:grid-cols-2 lg:items-stretch">
      <Card
        className={`flex min-w-0 flex-col p-5 lg:p-6 ${
          ownNextMatch ? "overflow-hidden" : ""
        }`}
      >
        {ownNextMatch ? (
          <div className="flex min-w-0 flex-1 flex-row items-center gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ball">Næste kamp</p>
              <p className="mt-2 font-display text-3xl tracking-wide break-words sm:text-4xl">
                {nextMatchWhen?.title}
              </p>
              {nextMatchWhen?.hint ? (
                <p className="mt-1 text-xs text-line/50">{nextMatchWhen.hint}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button to={`/kampe/${ownNextMatch.id}`}>Se detaljer</Button>
                <AddToCalendarButton
                  matchId={ownNextMatch.id}
                  playedAt={ownNextMatch.played_at}
                  status={ownNextMatch.status}
                  players={ownNextMatch.players}
                  durationMinutes={ownNextMatch.duration_minutes}
                  league={isLeagueMatch(ownNextMatch)}
                />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-1 lg:gap-2">
              <TeamAvatarStack
                people={teamPlayers(ownNextMatch.players, 1).map((player) =>
                  matchPlayerPreview(player, nextMatchPeople),
                )}
              />
              <p className="text-xs text-line/40 lg:text-sm">vs</p>
              <TeamAvatarStack
                people={teamPlayers(ownNextMatch.players, 2).map((player) =>
                  matchPlayerPreview(player, nextMatchPeople),
                )}
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="font-display text-3xl tracking-wide sm:text-4xl">
              Klar til at spille?
            </p>
            <p className="mt-2 max-w-sm text-sm text-line/55">
              Kalenderen er tom. Find nogen i klubben, eller sæt selv en kamp i
              gang.
            </p>
            <div className="mt-5 grid flex-1 grid-cols-2 gap-2 lg:mt-auto lg:min-h-[9rem] lg:pt-4">
              <HomePlayAction
                to="/matchmaker"
                icon={<SearchIcon />}
                title="Find kamp"
                hint="Se åbne opslag"
                featured
              />
              <HomePlayAction
                to="/kampe/ny"
                icon={<PlusIcon />}
                title="Opret kamp"
                hint="Sæt tid og spillere"
              />
            </div>
            {data && !hasAnyPrefs(data.matchFinder.mine) ? (
              <div className="mt-3 text-center">
                <Button variant="ghost" onClick={() => setTimesSheetOpen(true)}>
                  {MATCH_FINDER_COPY.setTimes}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {data ? (
        <MatchFinderCard
          className="lg:col-span-2 lg:order-last"
          userId={userId}
          matchFinder={data.matchFinder}
          ratings={ratings}
          onChanged={reload}
          onHiddenChange={setMatchFinderHiddenLocal}
        />
      ) : null}

      <Card className="flex min-w-0 flex-col overflow-hidden p-5 lg:p-6">
        <p className="text-sm font-semibold text-ball">
          Liga
          {data?.myGroupLabel ? ` · Gruppe ${data.myGroupLabel}` : ""}
        </p>
        {data?.inLeague ? (
          <>
            {!data.myGroupLabel ? (
              <p className="mt-2 text-sm text-line/55">
                I venter på at blive placeret i en gruppe.
              </p>
            ) : null}
            {data.leagueTable.length > 0 ? (
              <table className="mt-3 w-full table-fixed text-left text-sm">
                <tbody>
                  {data.leagueTable.map((row) => (
                    <tr
                      key={row.teamId}
                      className={`border-t border-line/10 first:border-t-0 ${
                        row.mine ? "text-line" : "text-line/50"
                      }`}
                    >
                      <td className="w-14 py-2.5 pr-2 align-middle">
                        <LeaguePlace
                          place={row.place}
                          mark={groupQualifyMark(
                            row.place,
                            data.groupCount,
                          )}
                          groupCount={data.groupCount}
                        />
                      </td>
                      <td className="max-w-0 py-2.5 align-middle">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex shrink-0">
                            {row.players.map((person, index) => (
                              <span
                                key={person.id}
                                className={index > 0 ? "-ml-1.5" : undefined}
                              >
                                <MemberAvatar
                                  person={person}
                                  size="xs"
                                  ring="court"
                                />
                              </span>
                            ))}
                          </div>
                          <div
                            className={`min-w-0 ${
                              row.mine ? "font-semibold" : ""
                            }`}
                          >
                            {row.players.length === 0 ? (
                              <p>Ukendt hold</p>
                            ) : (
                              row.players.map((person) => (
                                <p
                                  key={person.id}
                                  className="truncate leading-snug"
                                >
                                  {withRating(
                                    shortDisplayName(person),
                                    ratings.get(person.id),
                                  )}
                                </p>
                              ))
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="w-10 py-2.5 pl-2 text-right align-middle font-display text-lg leading-none tabular-nums text-ball">
                        {row.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-sm text-line/55">Ingen hold i tabellen endnu.</p>
            )}
            {leagueTotal > 0 ? (
              <>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-line/10">
                  <div
                    className="h-full rounded-full bg-ball"
                    style={{ width: `${Math.round(leagueProgress * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-line/50">
                  {data.remainingLeagueMatches != null
                    ? remainingLeagueCopy(data.remainingLeagueMatches)
                    : `${leaguePlayed} af ${leagueTotal} kampe`}
                </p>
              </>
            ) : null}
            {data.unreadDialogs > 0 ? (
              <p className="mt-2 text-xs text-line/50">
                {data.unreadDialogs === 1
                  ? "1 ulæst ligabesked"
                  : `${data.unreadDialogs} ulæste ligabeskeder`}
              </p>
            ) : null}
            <div className="mt-auto pt-6">
              <Button to="/liga">Se ligaen</Button>
            </div>
          </>
        ) : (
          <>
            {leagueHint ? (
              <p className="mt-2 text-sm text-line/55">{leagueHint}</p>
            ) : null}
            <div className={`mt-auto ${leagueHint ? "pt-6" : "pt-4"}`}>
              <Button to="/liga">Se ligaen</Button>
            </div>
          </>
        )}
      </Card>
      </div>

      {data && !data.hasPartner ? (
      <div className="mt-8 lg:hidden">
      <p className="ui-label mb-2 px-1">Klub</p>
      <ListGroup>
        <ListRow
          to="/find-partner"
          icon={<HandshakeIcon />}
          label="Find partner"
          hint="Fast makker, ikke en enkelt kamp"
        />
      </ListGroup>
      </div>
      ) : null}

      {data ? (
        <MatchFinderSheet
          open={timesSheetOpen}
          onClose={() => setTimesSheetOpen(false)}
          prefs={data.matchFinder.mine}
          hidden={data.matchFinder.hidden}
          onSaved={reload}
          onHiddenChange={setMatchFinderHiddenLocal}
        />
      ) : null}
    </Page>
  );
}

function HomePlayAction({
  to,
  icon,
  title,
  hint,
  featured = false,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  hint: string;
  featured?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex min-h-[7.25rem] flex-col justify-between rounded-2xl px-3.5 py-3.5 transition touch-manipulation lg:min-h-0 lg:px-4 lg:py-4 ${
        featured
          ? "bg-ball/15 text-ball ring-1 ring-ball/35 hover:bg-ball/25 hover:ring-ball/50 motion-safe:animate-home-nudge"
          : "border border-line/15 bg-court/40 text-line hover:border-ball hover:text-ball"
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full ${
          featured ? "bg-ball/20" : "bg-line/10 text-ball"
        }`}
      >
        {icon}
      </span>
      <span>
        <span className="mt-5 block font-display text-lg tracking-wide lg:text-xl">
          {title}
        </span>
        <span
          className={`mt-1 block text-xs ${
            featured ? "text-ball/70" : "text-line/50"
          }`}
        >
          {hint}
        </span>
      </span>
    </Link>
  );
}

function matchPlayerPreview(
  player: MatchPlayer,
  people: Map<string, PartnerPreview>,
): PartnerPreview {
  if (player.profile_id) {
    const person = people.get(player.profile_id);
    if (person) return person;
    return {
      id: player.profile_id,
      username: null,
      first_name: player.display_name,
      last_name: null,
      avatar_url: null,
    };
  }
  return {
    id: player.id,
    username: null,
    first_name: player.guest_name ?? player.display_name,
    last_name: null,
    avatar_url: null,
  };
}

function iconClass() {
  return "h-5 w-5";
}

function HandshakeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={iconClass()}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 13 4.5 9.5 8 6l3.5 3.5" />
      <path d="m16 13 3.5-3.5L16 6l-3.5 3.5" />
      <path d="M8.5 14.5 12 18l3.5-3.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={iconClass()}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16.5 20 20.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={iconClass()}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
