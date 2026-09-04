import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { MemberAvatar, MemberNameLink } from "../components/MemberAvatar";
import { SiteShell } from "../components/SiteShell";
import { Page, PageStatus } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import { messagePath } from "../lib/messages";
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
  const [iAmSeeking, setIAmSeeking] = useState(false);
  const [myNote, setMyNote] = useState("");
  const [showSeekForm, setShowSeekForm] = useState(false);
  const [seekNote, setSeekNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    const [{ data: me }, { data: rows, error: listError }, { data: requestRows }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("partner_id, seeking_partner, seeking_note")
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
    setIAmSeeking(Boolean(me?.seeking_partner));
    setMyNote(me?.seeking_note ?? "");
    setSeekNote(me?.seeking_note ?? "");
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
        <PageStatus>Indlæser…</PageStatus>
      </SiteShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (hasPartner) {
    return <Navigate to="/profil" replace />;
  }

  const seeking = members.filter((member) => member.seeking_partner);
  const available = members.filter((member) => !member.seeking_partner);

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

  async function handleStartSeeking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setSaving(true);
    const { error: seekError } = await supabase.rpc("set_seeking_partner", {
      p_note: seekNote,
    });
    setSaving(false);
    if (seekError) {
      setError(danishAuthError(seekError.message));
      return;
    }
    setShowSeekForm(false);
    setInfo("Du står nu som aktivt søgende.");
    await load();
  }

  async function handleStopSeeking() {
    setError(null);
    setInfo(null);
    const { error: stopError } = await supabase.rpc("clear_seeking_partner");
    if (stopError) {
      setError(danishAuthError(stopError.message));
      return;
    }
    setShowSeekForm(false);
    setSeekNote("");
    setInfo("Du søger ikke længere aktivt.");
    await load();
  }

  return (
    <SiteShell>
      <Page>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
          Partnerskab
        </p>
        <h1 className="mt-2 font-display text-6xl tracking-wide">Find partner</h1>
        <p className="mt-2 text-sm text-line/65">
          Medlemmer uden partner, og dem der aktivt søger en. Du kan kun have
          én partner.
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

        <section className="mt-8 rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-5">
          {iAmSeeking && !showSeekForm ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ball">
                Du søger en partner
              </p>
              <p className="mt-2 text-sm text-line/80">{myNote}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowSeekForm(true)}
                  className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                >
                  Rediger
                </button>
                <button
                  type="button"
                  onClick={() => void handleStopSeeking()}
                  className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                >
                  Stop med at søge
                </button>
              </div>
            </div>
          ) : showSeekForm ? (
            <form onSubmit={(event) => void handleStartSeeking(event)}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ball">
                Jeg søger en partner
              </p>
              <label className="mt-3 block text-sm font-medium text-line/80">
                Kort beskrivelse
                <textarea
                  required
                  maxLength={200}
                  rows={3}
                  value={seekNote}
                  onChange={(event) => setSeekNote(event.target.value)}
                  placeholder="Fx jeg er ny og søger en partner."
                  className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
                />
              </label>
              <p className="mt-1 text-xs text-line/45">{seekNote.length}/200</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court disabled:opacity-60"
                >
                  {saving ? "Gemmer…" : iAmSeeking ? "Gem" : "Offentliggør"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSeekForm(false);
                    setSeekNote(myNote);
                  }}
                  className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                >
                  Annuller
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowSeekForm(true)}
              className="rounded-full bg-ball px-5 py-2.5 text-sm font-semibold text-court"
            >
              Jeg søger en partner
            </button>
          )}
        </section>

        <MemberSection
          title="Søger aktivt"
          empty="Ingen søger aktivt lige nu."
          members={seeking}
          requests={requests}
          onRequest={handleRequest}
          onAccept={handleAccept}
          onCancel={handleCancel}
          showNote
        />
        <MemberSection
          title="Uden partner"
          empty="Ingen andre uden partner lige nu."
          members={available}
          requests={requests}
          onRequest={handleRequest}
          onAccept={handleAccept}
          onCancel={handleCancel}
        />
      </Page>
    </SiteShell>
  );
}

function MemberSection({
  title,
  empty,
  members,
  requests,
  onRequest,
  onAccept,
  onCancel,
  showNote = false,
}: {
  title: string;
  empty: string;
  members: PublicProfile[];
  requests: PartnershipRequest[];
  onRequest: (id: string) => void;
  onAccept: (id: string) => void;
  onCancel: (id: string) => void;
  showNote?: boolean;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-3xl tracking-wide">{title}</h2>
      <ul className="mt-4 space-y-3">
        {members.length === 0 ? (
          <li className="rounded-2xl border border-line/10 bg-court-mid/60 px-5 py-4 text-sm text-line/60">
            {empty}
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
                <div className="flex items-start gap-3">
                  <MemberAvatar person={member} size="sm" />
                  <div>
                    <MemberNameLink person={member} />
                    {member.username ? (
                      <p className="text-xs text-line/55">@{member.username}</p>
                    ) : null}
                    {showNote && member.seeking_note ? (
                      <p className="mt-2 text-sm text-line/75">
                        {member.seeking_note}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {member.username ? (
                    <Link
                      to={messagePath(member.username)}
                      className="rounded-full border border-ball/50 px-4 py-2 text-xs font-semibold text-ball"
                    >
                      Send besked
                    </Link>
                  ) : null}
                  {incoming ? (
                    <button
                      type="button"
                      onClick={() => onAccept(incoming.id)}
                      className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court"
                    >
                      Acceptér anmodning
                    </button>
                  ) : outgoing ? (
                    <button
                      type="button"
                      onClick={() => onCancel(outgoing.id)}
                      className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                    >
                      Annuller anmodning
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRequest(member.id)}
                      className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                    >
                      Anmod
                    </button>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
