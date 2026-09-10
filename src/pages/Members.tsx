import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { MemberAvatar } from "../components/MemberAvatar";
import { ChatBubbleIcon } from "../components/ChatBubbleIcon";
import { RatingMark } from "../components/RatingValue";
import { SiteShell } from "../components/SiteShell";
import { Page, PageHeader } from "../components/ui/Page";
import { SkeletonListRows, SkeletonRegion } from "../components/ui/Skeleton";
import { fieldClass } from "../components/ui/Field";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  PROFILE_SELECT,
  attachPartner,
  fetchMembersByIds,
  fullName,
  profilePath,
  type PublicProfile,
} from "../lib/profile";
import { messagePath } from "../lib/messages";
import { fetchPlayerRatingsByIds, type PlayerRating } from "../lib/rating";
import { supabase } from "../lib/supabase";

export function Members() {
  const { user, loading } = useAuth();
  const [members, setMembers] = useState<PublicProfile[]>([]);
  const [ratings, setRatings] = useState<Map<string, PlayerRating>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const { data: rows, error: listError } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .is("banned_at", null)
      .order("first_name", { ascending: true });

    if (listError) {
      setError(danishAuthError(listError.message));
      setReady(true);
      return;
    }

    const people = await fetchMembersByIds(
      (rows ?? []).map((row) => row.partner_id),
    );
    const ratingMap = await fetchPlayerRatingsByIds(
      (rows ?? []).map((row) => row.id),
    ).catch(() => new Map<string, PlayerRating>());
    setMembers((rows ?? []).map((row) => attachPartner(row, people)));
    setRatings(ratingMap);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!loading && user) {
      void load();
    }
  }, [load, loading, user]);

  const query = search.trim().toLowerCase();
  const visibleMembers = useMemo(() => {
    if (!query) return members;
    return members.filter((member) => {
      const name = fullName(member).toLowerCase();
      const username = (member.username ?? "").toLowerCase();
      return name.includes(query) || username.includes(query);
    });
  }, [members, query]);

  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  if (loading || !ready) {
    return (
      <SiteShell>
        <Page>
          <PageHeader eyebrow="Klubben" title="Medlemmer" />
          <Link
            to="/rating"
            className="mt-4 flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line/10 bg-court-mid px-4 py-3 transition hover:border-ball/30"
          >
            <span className="min-w-0">
              <span className="block font-semibold text-line">Rating</span>
              <span className="block text-xs text-line/55">
                Se klubbens rangliste
              </span>
            </span>
            <span aria-hidden className="shrink-0 text-lg text-line/35">
              ›
            </span>
          </Link>
          <label className="mt-4 block">
            <span className="sr-only">Søg blandt medlemmer</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Søg efter navn…"
              autoComplete="off"
              disabled
              className={fieldClass("bg-court-mid text-sm placeholder:text-line/40")}
            />
          </label>
          <SkeletonRegion>
            <div className="mt-6">
              <SkeletonListRows count={8} />
            </div>
          </SkeletonRegion>
        </Page>
      </SiteShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SiteShell>
      <Page>
        <PageHeader eyebrow="Klubben" title="Medlemmer" />
        <Link
          to="/rating"
          className="mt-4 flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line/10 bg-court-mid px-4 py-3 transition hover:border-ball/30"
        >
          <span className="min-w-0">
            <span className="block font-semibold text-line">Rating</span>
            <span className="block text-xs text-line/55">
              Se klubbens rangliste
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-lg text-line/35">
            ›
          </span>
        </Link>
        <label className="mt-4 block">
          <span className="sr-only">Søg blandt medlemmer</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Søg efter navn…"
            autoComplete="off"
            className={fieldClass("bg-court-mid text-sm placeholder:text-line/40")}
          />
        </label>

        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <ul className="mt-6 divide-y divide-line/10 overflow-hidden rounded-[var(--radius-card)] border border-line/10 bg-court-mid">
          {visibleMembers.length === 0 ? (
            <li className="px-4 py-4 text-sm text-line/60">
              {members.length === 0
                ? "Ingen medlemmer at vise."
                : "Ingen medlemmer matcher søgningen."}
            </li>
          ) : (
            visibleMembers.map((member) => {
              const href = profilePath(member.username);
              const partnerName = member.partner
                ? fullName(member.partner)
                : null;
              const isYou = member.id === user.id;

              return (
                <li key={member.id} className="flex items-stretch">
                  <Link
                    to={href}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition hover:bg-line/[0.03]"
                  >
                    <MemberAvatar person={member} size="sm" />
                    <div className="min-w-0 flex-1 lg:flex lg:items-center lg:justify-between lg:gap-4">
                      <div className="min-w-0">
                      <p className="font-semibold text-line">
                        {fullName(member)}
                        {isYou ? (
                          <span className="ml-2 text-xs font-semibold uppercase tracking-[0.16em] text-ball">
                            Dig
                          </span>
                        ) : null}
                        <RatingMark value={ratings.get(member.id)?.rating} />
                      </p>
                      {member.username ? (
                        <p className="text-xs text-line/55">@{member.username}</p>
                      ) : null}
                      </div>
                      {partnerName ? (
                        <p className="mt-1 text-sm text-line/65 lg:mt-0 lg:shrink-0">
                          Partner: {partnerName}
                        </p>
                      ) : member.seeking_partner ? (
                        <p className="mt-1 text-sm text-line/65 lg:mt-0 lg:shrink-0">
                          Søger partner
                        </p>
                      ) : null}
                    </div>
                  </Link>
                  {!isYou && member.username ? (
                    <Link
                      to={messagePath(member.username)}
                      aria-label={`Send besked til ${fullName(member)}`}
                      title="Send besked"
                      className="flex w-12 shrink-0 items-center justify-center border-l border-line/10 text-line/70 transition hover:text-ball"
                    >
                      <ChatBubbleIcon />
                    </Link>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </Page>
    </SiteShell>
  );
}
