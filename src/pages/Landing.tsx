import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  fetchHomeDashboard,
  remainingLeagueCopy,
  unreadDialogCopy,
  type HomeDashboard,
} from "../lib/home";
import { formatMatchWhen, teamNames } from "../lib/match";

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
    <main className="flex min-h-[calc(100vh-5.5rem)] flex-col items-center justify-center px-6 pb-16 text-center">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-ball">
        Lukket padelklub
      </p>
      <h1 className="font-display text-[clamp(4.2rem,16vw,10rem)] leading-[0.85] tracking-[0.04em]">
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
  const nextHref = data?.nextMatch ? `/kampe/${data.nextMatch.id}` : "/kampe";

  return (
    <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-6 pb-16">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
        Hjem
      </p>
      <h1 className="mt-2 font-display text-6xl tracking-wide">Hej {greeting}</h1>
      <p className="mt-2 text-sm text-line/65">Her er det næste skridt.</p>
      {error ? (
        <p className="mt-4 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      {data ? (
        <ul className="mt-8 space-y-3">
          <li>
            <Link
              to="/liga"
              className={`block rounded-2xl border bg-court-mid px-5 py-4 shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition hover:border-ball/40 ${
                data.unreadDialogs > 0 ? "border-ball/50" : "border-line/10"
              }`}
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-line/45">
                Dialoger
              </p>
              <p className="mt-1 font-display text-3xl tracking-wide">
                {unreadDialogCopy(data.unreadDialogs)}
              </p>
              <p className="mt-1 text-sm text-line/60">
                {data.unreadDialogs > 0
                  ? "Åbn ligaen og svar i kamp-dialogerne."
                  : "Ingen nye beskeder i jeres kamp-dialoger."}
              </p>
            </Link>
          </li>
          <li>
            <Link
              to={nextHref}
              className={`block rounded-2xl border bg-court-mid px-5 py-4 shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition hover:border-ball/40 ${
                data.nextMatchIsOwn ? "border-ball/35" : "border-line/10"
              }`}
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-line/45">
                Næste kamp
              </p>
              {data.nextMatch ? (
                <>
                  <p className="mt-1 font-display text-3xl tracking-wide">
                    {formatMatchWhen(data.nextMatch.played_at)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-line">
                    {teamNames(data.nextMatch.players, 1)}{" "}
                    <span className="font-normal text-line/45">vs</span>{" "}
                    {teamNames(data.nextMatch.players, 2)}
                  </p>
                  {data.nextMatchIsOwn ? (
                    <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-ball/80">
                      Du spiller
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-line/60">
                      Næste planlagte kamp i klubben.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="mt-1 font-display text-3xl tracking-wide">
                    Ingen planlagte kampe
                  </p>
                  <p className="mt-1 text-sm text-line/60">
                    Opret en kamp, eller find en dato i ligaen.
                  </p>
                </>
              )}
            </Link>
          </li>
          <li>
            <Link
              to="/liga"
              className={`block rounded-2xl border bg-court-mid px-5 py-4 shadow-[0_10px_28px_rgba(0,0,0,0.35)] transition hover:border-ball/40 ${
                data.leagueInvites > 0 ||
                (data.inLeague && (data.remainingLeagueMatches ?? 0) > 0)
                  ? "border-ball/35"
                  : "border-line/10"
              }`}
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-line/45">
                Liga
              </p>
              {data.inLeague && data.remainingLeagueMatches !== null ? (
                <>
                  <p className="mt-1 font-display text-3xl tracking-wide">
                    {remainingLeagueCopy(data.remainingLeagueMatches)}
                  </p>
                  <p className="mt-1 text-sm text-line/60">
                    {data.remainingLeagueMatches > 0
                      ? "Spil dem inden ligaen slutter."
                      : "Alle jeres ligakampe er registreret."}
                  </p>
                </>
              ) : data.leagueInvites > 0 ? (
                <>
                  <p className="mt-1 font-display text-3xl tracking-wide">
                    {data.leagueInvites === 1
                      ? "1 ligaanmodning"
                      : `${data.leagueInvites} ligaanmodninger`}
                  </p>
                  <p className="mt-1 text-sm text-line/60">
                    Nogen vil spille liga med dig. Acceptér eller afvis.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 font-display text-3xl tracking-wide">
                    {data.signupOpen
                      ? "Tilmeld jer ligaen"
                      : "Ingen aktiv tilmelding"}
                  </p>
                  <p className="mt-1 text-sm text-line/60">
                    {data.signupOpen
                      ? "Find en makker og send en anmodning. Holdet oprettes, når de siger ja."
                      : "Der er ikke et åbent hold for dig lige nu."}
                  </p>
                </>
              )}
            </Link>
          </li>
        </ul>
      ) : null}
    </main>
  );
}
