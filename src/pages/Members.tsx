import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { MemberAvatar } from "../components/MemberAvatar";
import { ChatBubbleIcon } from "../components/ChatBubbleIcon";
import { SiteShell } from "../components/SiteShell";
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
import { supabase } from "../lib/supabase";

export function Members() {
  const { user, loading } = useAuth();
  const [members, setMembers] = useState<PublicProfile[]>([]);
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
    setMembers((rows ?? []).map((row) => attachPartner(row, people)));
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

  if (loading || (!ready && user)) {
    return (
      <SiteShell>
        <main className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center px-6 text-sm text-line/60">
          Indlæser…
        </main>
      </SiteShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-6 pb-16">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
          Klubben
        </p>
        <h1 className="mt-2 font-display text-6xl tracking-wide">Medlemmer</h1>
        <label className="mt-4 block">
          <span className="sr-only">Søg blandt medlemmer</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Søg efter navn…"
            autoComplete="off"
            className="w-full rounded-2xl border border-line/15 bg-court-mid px-4 py-3 text-sm text-line outline-none placeholder:text-line/40 focus:border-ball"
          />
        </label>

        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <ul className="mt-6 space-y-3">
          {visibleMembers.length === 0 ? (
            <li className="rounded-2xl border border-line/10 bg-court-mid/60 px-5 py-4 text-sm text-line/60">
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
                <li key={member.id} className="flex items-stretch gap-2">
                  <Link
                    to={href}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line/10 bg-court-mid/80 px-5 py-4 transition hover:border-ball/40"
                  >
                    <MemberAvatar person={member} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-line">
                        {fullName(member)}
                        {isYou ? (
                          <span className="ml-2 text-xs font-semibold uppercase tracking-[0.16em] text-ball">
                            Dig
                          </span>
                        ) : null}
                      </p>
                      {member.username ? (
                        <p className="text-xs text-line/55">@{member.username}</p>
                      ) : null}
                      {partnerName ? (
                        <p className="mt-1 text-sm text-line/65">
                          Partner: {partnerName}
                        </p>
                      ) : member.seeking_partner ? (
                        <p className="mt-1 text-sm text-line/65">Søger partner</p>
                      ) : null}
                    </div>
                  </Link>
                  {!isYou && member.username ? (
                    <Link
                      to={messagePath(member.username)}
                      aria-label={`Send besked til ${fullName(member)}`}
                      title="Send besked"
                      className="flex w-14 shrink-0 items-center justify-center rounded-2xl border border-line/10 bg-court-mid/80 text-ball transition hover:border-ball/40"
                    >
                      <ChatBubbleIcon />
                    </Link>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </main>
    </SiteShell>
  );
}
