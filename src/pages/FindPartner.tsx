import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { MemberAvatar, MemberNameLink } from "../components/MemberAvatar";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  PROFILE_SELECT,
  REQUEST_SELECT,
  attachRequestPeople,
  fetchMembersByIds,
  type PartnershipRequest,
  type PublicProfile,
} from "../lib/profile";
import { supabase } from "../lib/supabase";

export function FindPartner() {
  const { user, loading } = useAuth();
  const [members, setMembers] = useState<PublicProfile[]>([]);
  const [requests, setRequests] = useState<PartnershipRequest[]>([]);
  const [hasPartner, setHasPartner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    const [{ data: me }, { data: rows, error: listError }, { data: requestRows }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("partner_id")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select(PROFILE_SELECT)
          .is("partner_id", null)
          .is("banned_at", null)
          .neq("id", user.id)
          .order("first_name", { ascending: true }),
        supabase
          .from("partnership_requests")
          .select(REQUEST_SELECT)
          .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`),
      ]);

    if (listError) {
      setError(danishAuthError(listError.message));
      setReady(true);
      return;
    }

    setHasPartner(Boolean(me?.partner_id));
    setMembers((rows ?? []) as PublicProfile[]);
    const people = await fetchMembersByIds(
      (requestRows ?? []).flatMap((row) => [row.requester_id, row.recipient_id]),
    );
    setRequests(
      (requestRows ?? []).map((row) => attachRequestPeople(row, people)),
    );
    setReady(true);
  }, [user]);

  useEffect(() => {
    if (!loading && user) {
      void load();
    }
  }, [load, loading, user]);

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

  if (hasPartner) {
    return <Navigate to="/profil" replace />;
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

  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-6 pb-16">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
          Partnerskab
        </p>
        <h1 className="mt-2 font-display text-6xl tracking-wide">Find partner</h1>
        <p className="mt-2 text-sm text-line/65">
          Her er medlemmer, der ikke har en partner endnu. Du kan kun have én.
        </p>
        <Link to="/profil" className="mt-4 text-sm font-semibold text-ball">
          Tilbage til profil
        </Link>

        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-4 text-sm text-ball" role="status">
            {info}
          </p>
        ) : null}

        <ul className="mt-8 space-y-3">
          {members.length === 0 ? (
            <li className="rounded-2xl border border-line/10 bg-court-mid/60 px-5 py-4 text-sm text-line/60">
              Ingen ledige partnere lige nu.
            </li>
          ) : (
            members.map((member) => {
              const incoming = requests.find(
                (request) => request.requester_id === member.id,
              );
              const outgoing = requests.find(
                (request) => request.recipient_id === member.id,
              );

              return (
                <li
                  key={member.id}
                  className="flex flex-col gap-3 rounded-2xl border border-line/10 bg-court-mid/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <MemberAvatar person={member} size="sm" />
                    <div>
                      <MemberNameLink person={member} />
                      {member.username ? (
                        <p className="text-xs text-line/55">@{member.username}</p>
                      ) : null}
                    </div>
                  </div>
                  {incoming ? (
                    <button
                      type="button"
                      onClick={() => void handleAccept(incoming.id)}
                      className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court"
                    >
                      Acceptér anmodning
                    </button>
                  ) : outgoing ? (
                    <button
                      type="button"
                      onClick={() => void handleCancel(outgoing.id)}
                      className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                    >
                      Annuller anmodning
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleRequest(member.id)}
                      className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                    >
                      Anmod
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </main>
    </SiteShell>
  );
}
