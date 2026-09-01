import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  fetchHomeDashboard,
  remainingLeagueCopy,
  type HomeDashboard,
} from "../lib/home";
import { formatMatchWhen } from "../lib/match";

export function Landing() {
  const { user, loading, username } = useAuth();

  return (
    <SiteShell>
      {loading ? (
        <main className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center px-6 text-sm text-line/60">
          Indlæser…
        </main>
      ) : user ? (
        <HomeDashboardView
          userId={user.id}
          username={username}
        />
      ) : (
        <GuestLanding />
      )}
    </SiteShell>
  );
}

function GuestLanding() {
  return (
    <main className="flex min-h-[calc(100vh-5.5rem)] w-full max-w-full flex-col items-center justify-center px-6 pb-16 text-center">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-ball">
        Lukket padelklub
      </p>
      <h1 className="max-w-full font-display text-[clamp(2.75rem,14vw,10rem)] leading-[0.85] tracking-[0.04em]">
        Padel By Ramm
      </h1>
      <p className="mt-6 max-w-lg text-base text-line/75 sm:text-lg">
        Velkommen til den lokale padel-liga. Log ind, hvis du allerede er
        medlem, eller opret en konto med en invitationskode.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Link
          to="/login"
          className="rounded-full border border-line/25 px-8 py-3 text-sm font-semibold tracking-wide transition hover:border-ball hover:text-ball"
        >
          Log ind
        </Link>
        <Link
          to="/register"
          className="rounded-full bg-ball px-8 py-3 text-sm font-semibold tracking-wide text-court transition hover:bg-line"
        >
          Opret konto
        </Link>
      </div>
    </main>
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
    fetchHomeDashboard(userId)
      .then((dashboard) => {
        if (!cancelled) setData(dashboard);
      })
      .catch((loadError: Error) => {
        if (!cancelled) setError(danishAuthError(loadError.message));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!data && !error) {
    return (
      <main className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center px-6 text-sm text-line/60">
        Indlæser…
      </main>
    );
  }

  const greeting = data?.firstName || username || "der";
  const remaining = data?.remainingLeagueMatches ?? null;
  const leagueHint = !data
    ? undefined
    : data.inLeague && remaining !== null
      ? remainingLeagueCopy(remaining)
      : data.leagueInvites > 0
        ? data.leagueInvites === 1
          ? "1 anmodning venter"
          : `${data.leagueInvites} anmodninger venter`
        : data.signupOpen
          ? "Tilmeld jer"
          : undefined;
  const ownNextMatch =
    data?.nextMatch && data.nextMatchIsOwn ? data.nextMatch : null;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-4 pb-16 sm:px-6">
      <h1 className="font-display text-5xl tracking-wide sm:text-6xl">
        Hej {greeting}
      </h1>
      {error ? (
        <p className="mt-4 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      {data ? (
        <nav aria-label="Hovedmenu" className="mt-6">
          <ul className="space-y-2">
            <NavRow
              to="/nyt"
              icon={<BellIcon />}
              label="Nyt"
              notify={data.unreadNotifications}
            />
            <NavRow
              to="/liga"
              icon={<LeagueIcon />}
              label="Liga"
              hint={leagueHint}
              notify={data.unreadDialogs}
            />
          </ul>
          <p className="mt-6 mb-2 px-1 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-line/40">
            Kampe
          </p>
          <ul className="space-y-2">
            {ownNextMatch ? (
              <NavRow
                to={`/kampe/${ownNextMatch.id}`}
                icon={<CalendarIcon />}
                label="Næste kamp"
                hint={formatMatchWhen(ownNextMatch.played_at)}
              />
            ) : null}
            <NavRow
              to="/kampe"
              icon={<MatchesIcon />}
              label="Se alle kampe"
            />
            <NavRow
              to="/matchmaker"
              icon={<SearchIcon />}
              label="Find kamp"
              hint="Opslag om at spille"
            />
            <NavRow to="/kampe/ny" icon={<PlusIcon />} label="Opret kamp" />
          </ul>
          <p className="mt-6 mb-2 px-1 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-line/40">
            Klub
          </p>
          <ul className="space-y-2">
            <NavRow
              to="/medlemmer"
              icon={<MembersIcon />}
              label="Medlemsliste"
            />
            <NavRow to="/profil" icon={<ProfileIcon />} label="Min profil" />
            {isAdmin ? (
              <NavRow
                to="/admin"
                icon={<AdminIcon />}
                label="Invitationer"
              />
            ) : null}
          </ul>
        </nav>
      ) : null}
    </main>
  );
}

function NavRow({
  to,
  icon,
  label,
  hint,
  badge,
  notify = 0,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  hint?: string;
  badge?: number | null;
  notify?: number;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-14 items-center gap-3 rounded-2xl border border-line/10 bg-court-mid px-3 py-3 touch-manipulation transition hover:border-ball/40 sm:min-h-16 sm:px-4"
      >
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-court text-ball">
          {icon}
          {notify > 0 ? (
            <span
              className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ball px-1 text-[0.65rem] font-bold text-court"
              aria-label={
                notify === 1 ? "1 ny besked" : `${notify} nye beskeder`
              }
            >
              {notify > 9 ? "9+" : notify}
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold leading-tight">
            {label}
          </span>
          {hint ? (
            <span className="mt-0.5 block truncate text-sm text-line/60">
              {hint}
            </span>
          ) : null}
        </span>
        {badge != null ? (
          <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-ball px-2 text-sm font-bold text-court">
            {badge}
          </span>
        ) : null}
      </Link>
    </li>
  );
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

function LeagueIcon() {
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
      <path d="M8 4h8v3a4 4 0 0 1-8 0V4Z" />
      <path d="M12 11v3" />
      <path d="M7 21h10" />
      <path d="M9 21v-4a3 3 0 0 1 6 0v4" />
    </svg>
  );
}

function CalendarIcon() {
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
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3.5v3" />
      <path d="M16 3.5v3" />
      <path d="M3.5 10h17" />
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

function ProfileIcon() {
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
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19.5a7 7 0 0 1 14 0" />
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
