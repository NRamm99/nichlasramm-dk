import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import { fullName, type PartnerPreview } from "../lib/profile";
import { supabase } from "../lib/supabase";

function todayDateInput() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function MatchmakerCreate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState<PartnerPreview[]>([]);
  const [clubPartnerId, setClubPartnerId] = useState<string | null>(null);
  const [date, setDate] = useState(todayDateInput);
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("20:00");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [bringPartner, setBringPartner] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    void Promise.all([
      supabase
        .from("profiles")
        .select("id, username, first_name, last_name, avatar_url")
        .is("banned_at", null)
        .order("first_name"),
      supabase.from("profiles").select("partner_id").eq("id", user.id).maybeSingle(),
    ]).then(([list, me]) => {
      const rows = ((list.data ?? []) as PartnerPreview[]).filter(
        (row) => row.id !== user.id,
      );
      setMembers(rows);
      const current = me.data?.partner_id ?? null;
      setClubPartnerId(current);
      if (current) {
        setBringPartner(true);
        setPartnerId(current);
      }
    });
  }, [user]);

  const partnerOptions = useMemo(
    () => members.filter((row) => row.id !== user?.id),
    [members, user?.id],
  );

  if (loading) {
    return (
      <SiteShell>
        <main className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center px-6 text-sm text-line/60">
          Indlæser…
        </main>
      </SiteShell>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const starts = new Date(`${date}T${startTime}`);
    const ends = new Date(`${date}T${endTime}`);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
      setError(danishAuthError("INVALID_WHEN"));
      return;
    }
    setSaving(true);
    const { data, error: saveError } = await supabase.rpc(
      "create_matchmaker_listing",
      {
        p_starts_at: starts.toISOString(),
        p_ends_at: ends.toISOString(),
        p_location: location,
        p_note: note,
        p_partner_id: bringPartner && partnerId ? partnerId : null,
      },
    );
    setSaving(false);
    if (saveError) {
      setError(danishAuthError(saveError.message));
      return;
    }
    navigate(`/matchmaker/${data}`, { replace: true });
  }

  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-4 pb-16 sm:px-6">
        <h1 className="font-display text-5xl tracking-wide">Ny annonce</h1>
        <Link to="/matchmaker" className="mt-2 text-sm font-semibold text-ball">
          Tilbage til find kamp
        </Link>
        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-line/80">
            Dato
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-line/15 bg-court-mid px-4 py-3 outline-none focus:border-ball"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-line/80">
              Fra
              <input
                type="time"
                required
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-line/15 bg-court-mid px-4 py-3 outline-none focus:border-ball"
              />
            </label>
            <label className="block text-sm font-medium text-line/80">
              Til
              <input
                type="time"
                required
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-line/15 bg-court-mid px-4 py-3 outline-none focus:border-ball"
              />
            </label>
          </div>
          <label className="block text-sm font-medium text-line/80">
            Sted
            <input
              value={location}
              maxLength={120}
              placeholder="Valgfrit"
              onChange={(event) => setLocation(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-line/15 bg-court-mid px-4 py-3 outline-none placeholder:text-line/40 focus:border-ball"
            />
          </label>
          <label className="block text-sm font-medium text-line/80">
            Besked
            <textarea
              value={note}
              maxLength={500}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-line/15 bg-court-mid px-4 py-3 outline-none focus:border-ball"
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={bringPartner}
              onChange={(event) => {
                setBringPartner(event.target.checked);
                if (event.target.checked && clubPartnerId && !partnerId) {
                  setPartnerId(clubPartnerId);
                }
              }}
            />
            Jeg tager min makker med (2 pladser)
          </label>
          {bringPartner ? (
            <label className="block text-sm font-medium text-line/80">
              Makker
              <select
                required
                value={partnerId}
                onChange={(event) => setPartnerId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-line/15 bg-court-mid px-4 py-3 outline-none focus:border-ball"
              >
                <option value="">Vælg medlem</option>
                {partnerOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {fullName(member)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-ball px-4 py-3 text-sm font-semibold text-court disabled:opacity-60"
          >
            {saving ? "Opretter…" : "Opret annonce"}
          </button>
        </form>
      </main>
    </SiteShell>
  );
}
