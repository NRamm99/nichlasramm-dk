import { useEffect, useState } from "react";
import { SiteShell } from "../components/SiteShell";
import { ChatBubbleIcon } from "../components/ChatBubbleIcon";
import { HomePoll } from "../components/HomePoll";
import { LeaguePlace } from "../components/LeaguePlace";
import { MemberAvatar, TeamAvatarStack } from "../components/MemberAvatar";
import { PushNotifications } from "../components/PushNotifications";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ListGroup, ListRow } from "../components/ui/ListGroup";
import { Page, PageStatus } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  fetchHomeDashboard,
  remainingLeagueCopy,
  type HomeDashboard,
} from "../lib/home";
import {
  formatNextMatchWhen,
  teamPlayers,
  type MatchPlayer,
} from "../lib/match";
import { shortDisplayName, type PartnerPreview } from "../lib/profile";
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
    <Page center className="text-center">
      <p className="ui-label text-ball">Lukket padelklub</p>
      <h1 className="mt-4 max-w-full font-display text-[clamp(2.75rem,14vw,10rem)] leading-[0.85] tracking-[0.04em]">
        Padel By Ramm
      </h1>
      <p className="mt-6 max-w-lg text-base text-line/75 sm:text-lg">
        Velkommen til den lokale padel-liga. Log ind, hvis du allerede er
        medlem, eller opret en konto med en invitationskode.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Button variant="secondary" to="/login" className="px-8 py-3">
          Log ind
        </Button>
        <Button to="/register" className="px-8 py-3">
          Opret konto
        </Button>
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
  const { isAdmin } = useAuth();
  const [data, setData] = useState<HomeDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const dashboard = await fetchHomeDashboard(userId);
        if (cancelled) return;
        setData(dashboard);
        void setAppBadgeCount(dashboard.unreadNotifications);
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
  }, [userId]);

  if (!data && !error) {
    return <PageStatus>Indlæser…</PageStatus>;
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
  const nextMatchPeople = data?.nextMatchPeople ?? new Map<string, PartnerPreview>();
  const leagueTotal = data?.leagueTotal ?? 0;
  const leaguePlayed = data?.leaguePlayed ?? 0;
  const leagueProgress =
    data?.inLeague && leagueTotal > 0 ? leaguePlayed / leagueTotal : 0;

  return (
    <Page>
      <h1 className="font-display text-4xl tracking-wide sm:text-5xl">
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

      <Card className="mt-6 p-5">
        {ownNextMatch ? (
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ball">Næste kamp</p>
              <p className="mt-2 font-display text-3xl tracking-wide sm:text-4xl">
                {formatNextMatchWhen(ownNextMatch.played_at)}
              </p>
              <Button to={`/kampe/${ownNextMatch.id}`} block className="mt-4">
                Se detaljer
              </Button>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <TeamAvatarStack
                people={teamPlayers(ownNextMatch.players, 1).map((player) =>
                  matchPlayerPreview(player, nextMatchPeople),
                )}
              />
              <p className="text-xs text-line/40">vs</p>
              <TeamAvatarStack
                people={teamPlayers(ownNextMatch.players, 2).map((player) =>
                  matchPlayerPreview(player, nextMatchPeople),
                )}
              />
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-ball">Næste kamp</p>
            <p className="mt-2 text-sm text-line/55">
              Ingen planlagt kamp i kalenderen.
            </p>
            <div className="mt-4 grid gap-2">
              <Button to="/matchmaker" block>
                Find kamp
              </Button>
              <Button to="/kampe/ny" variant="secondary" block>
                Opret kamp
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card className="mt-3 p-5">
        <p className="text-sm font-semibold text-ball">Liga</p>
        {data?.inLeague ? (
          <>
            {data.leagueTable.length > 0 ? (
              <table className="mt-3 w-full text-left text-sm">
                <tbody>
                  {data.leagueTable.map((row) => (
                    <tr
                      key={row.teamId}
                      className={`border-t border-line/10 first:border-t-0 ${
                        row.mine ? "text-line" : "text-line/50"
                      }`}
                    >
                      <td className="w-14 py-2.5 pr-2 align-middle">
                        <LeaguePlace place={row.place} />
                      </td>
                      <td className="py-2.5 align-middle">
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
                          <p
                            className={`min-w-0 truncate ${
                              row.mine ? "font-semibold" : ""
                            }`}
                          >
                            {row.players
                              .map((person) => shortDisplayName(person))
                              .join(" / ") || "Ukendt hold"}
                          </p>
                        </div>
                      </td>
                      <td className="py-2.5 pl-2 text-right align-middle font-display text-lg leading-none tabular-nums text-ball">
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
            <Button to="/liga" block className="mt-4">
              Se ligaen
            </Button>
          </>
        ) : (
          <>
            {leagueHint ? (
              <p className="mt-2 text-sm text-line/55">{leagueHint}</p>
            ) : null}
            <Button to="/liga" block className={leagueHint ? "mt-4" : "mt-3"}>
              Se ligaen
            </Button>
          </>
        )}
      </Card>

      <p className="ui-label mt-8 mb-2 px-1">Kampe</p>
      <ListGroup>
        <ListRow
          to="/kampe"
          icon={<MatchesIcon />}
          label="Se alle kampe"
        />
        <ListRow
          to="/matchmaker"
          icon={<SearchIcon />}
          label="Find kamp"
          hint="Opslag om at spille"
        />
        <ListRow to="/kampe/ny" icon={<PlusIcon />} label="Opret kamp" />
      </ListGroup>

      <p className="ui-label mt-8 mb-2 px-1">Klub</p>
      <ListGroup>
        <ListRow
          to="/beskeder"
          icon={<ChatBubbleIcon className="h-5 w-5" />}
          label="Beskeder"
          badge={data?.unreadMessages}
        />
        {data && !data.hasPartner ? (
          <ListRow
            to="/find-partner"
            icon={<HandshakeIcon />}
            label="Find partner"
            hint="Fast makker, ikke en enkelt kamp"
          />
        ) : null}
        <ListRow
          to="/medlemmer"
          icon={<MembersIcon />}
          label="Medlemsliste"
        />
        <ListRow
          to="/nyt"
          icon={<BellIcon />}
          label="Nyt"
          badge={data?.unreadNotifications}
        />
        {isAdmin ? (
          <ListRow to="/admin" icon={<AdminIcon />} label="Administration" />
        ) : null}
      </ListGroup>
    </Page>
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

function BellIcon() {
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
      <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 11H3c0-4 3-4 3-11Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
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

function MatchesIcon() {
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
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h10" />
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

function MembersIcon() {
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
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M20.5 19a4.5 4.5 0 0 0-6-4.2" />
    </svg>
  );
}

function AdminIcon() {
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
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}
