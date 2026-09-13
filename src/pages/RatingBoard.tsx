import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { MemberAvatar } from "../components/MemberAvatar";
import { SiteShell } from "../components/SiteShell";
import { BackLink, Page, PageHeader } from "../components/ui/Page";
import {
  Skeleton,
  SkeletonCircle,
  SkeletonRegion,
} from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import { fullName, profilePath } from "../lib/profile";
import {
  DEFAULT_RATING_SETTINGS,
  fetchRatingLeaderboard,
  fetchRatingSettings,
  isProvisional,
  type RatingLeaderboardRow,
  type RatingSettings,
} from "../lib/rating";

export function RatingBoard() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<RatingLeaderboardRow[]>([]);
  const [settings, setSettings] = useState<RatingSettings>(
    DEFAULT_RATING_SETTINGS,
  );
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const [board, nextSettings] = await Promise.all([
        fetchRatingLeaderboard(),
        fetchRatingSettings(),
      ]);
      setRows(board);
      setSettings(nextSettings);
    } catch (loadError) {
      setError(
        danishAuthError(
          loadError instanceof Error ? loadError.message : "Ukendt fejl",
        ),
      );
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!loading && user) {
      void load();
    }
  }, [load, loading, user]);

  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  if (loading || !ready) {
    return (
      <SiteShell>
        <Page>
          <BackLink to="/medlemmer">Medlemmer</BackLink>
          <div className="mt-4">
            <PageHeader eyebrow="Klubben" title="Rating" />
          </div>
          <p className="mt-3 text-sm text-line/60">
            Ratingen bevæger sig efter hver spillet kamp. Slår du et stærkere hold,
            stiger du meget — taber du til et svagere, falder du tilsvarende.
          </p>
          <SkeletonRegion>
            <ul className="mt-6 divide-y divide-line/10 overflow-hidden rounded-[var(--radius-card)] border border-line/10 bg-court-mid">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
                <li
                  key={row}
                  className="flex items-center gap-3 px-3 py-3 sm:px-4"
                >
                  <Skeleton className="h-7 w-6 shrink-0" />
                  <SkeletonCircle />
                  <span className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-1/2" />
                  </span>
                  <Skeleton className="h-8 w-12 shrink-0" />
                </li>
              ))}
            </ul>
          </SkeletonRegion>
        </Page>
      </SiteShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const anyProvisional = rows.some((row) => isProvisional(row, settings));

  return (
    <SiteShell>
      <Page>
        <BackLink to="/medlemmer">Medlemmer</BackLink>
        <div className="mt-4">
          <PageHeader eyebrow="Klubben" title="Rating" />
        </div>
        <p className="mt-3 text-sm text-line/60">
          Ratingen bevæger sig efter hver spillet kamp. Slår du et stærkere hold,
          stiger du meget — taber du til et svagere, falder du tilsvarende.
        </p>

        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <ul className="mt-6 divide-y divide-line/10 overflow-hidden rounded-[var(--radius-card)] border border-line/10 bg-court-mid">
          {rows.length === 0 ? (
            <li className="px-4 py-4 text-sm text-line/60">
              Ingen ratings endnu. De kommer, så snart der er spillet kampe.
            </li>
          ) : (
            rows.map((row, index) => {
              const isYou = row.profile_id === user.id;
              const provisional = isProvisional(row, settings);

              return (
                <li key={row.profile_id}>
                  <Link
                    to={profilePath(row.person.username)}
                    className={`flex items-center gap-3 px-3 py-3 transition hover:bg-line/[0.03] sm:px-4 ${
                      isYou ? "bg-ball/[0.06]" : ""
                    }`}
                  >
                    <span className="w-6 shrink-0 text-center font-display text-2xl leading-none tabular-nums text-line/35">
                      {index + 1}
                    </span>
                    <MemberAvatar person={row.person} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-line">
                        {fullName(row.person)}
                        {isYou ? (
                          <span className="ml-2 text-xs font-semibold uppercase tracking-[0.16em] text-ball">
                            Dig
                          </span>
                        ) : null}
                        <span className="font-normal tabular-nums text-line/45">
                          {" "}({row.rating})
                        </span>
                      </p>
                      <p className="text-xs text-line/50">
                        {row.matches_rated}{" "}
                        {row.matches_rated === 1 ? "kamp" : "kampe"} · bedste{" "}
                        {row.peak_rating}
                      </p>
                    </div>
                    <span className="shrink-0 text-right">
                      <span className="font-display text-3xl leading-none tabular-nums text-ball">
                        {row.rating}
                      </span>
                      {provisional ? (
                        <span
                          title={`Foreløbig indtil ${settings.provisional_matches} kampe`}
                          className="align-super text-sm text-line/40"
                        >
                          *
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })
          )}
        </ul>

        {anyProvisional ? (
          <p className="mt-3 px-1 text-xs text-line/45">
            * Foreløbig rating. De første {settings.provisional_matches} kampe
            tæller ekstra, mens systemet finder niveauet.
          </p>
        ) : null}
      </Page>
    </SiteShell>
  );
}
