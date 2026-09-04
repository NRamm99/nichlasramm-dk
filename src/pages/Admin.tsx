import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { AdminPushBroadcast } from "../components/AdminPushBroadcast";
import { SiteShell } from "../components/SiteShell";
import { Page, PageStatus } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import { supabase } from "../lib/supabase";
import type { InviteCode } from "../lib/types";

function memberLabel(invite: InviteCode) {
  const firstName = invite.member_first_name ?? invite.member?.first_name;
  const lastName = invite.member_last_name ?? invite.member?.last_name;
  const username = invite.member_username ?? invite.member?.username;
  const avatar = invite.member_avatar_url ?? invite.member?.avatar_url;
  const banned = Boolean(invite.banned_at ?? invite.member?.banned_at);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return { firstName, lastName, username, avatar, banned, fullName };
}

function formatWhen(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function AdminFold({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-3xl tracking-wide">{title}</h2>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold text-line/80"
        >
          {open ? "Skjul" : count ? `Vis (${count})` : "Vis"}
        </button>
      </div>
      {open ? children : null}
    </section>
  );
}

export function Admin() {
  const { user, loading, isAdmin, refreshProfile } = useAuth();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [pendingBanId, setPendingBanId] = useState<string | null>(null);
  const [pendingResetId, setPendingResetId] = useState<string | null>(null);
  const [issuedReset, setIssuedReset] = useState<{
    label: string;
    code: string;
  } | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [showUnused, setShowUnused] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const loadCodes = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("invite_codes")
      .select(
        "id, code, created_at, created_by, used_at, used_by, member_username, member_first_name, member_last_name, member_avatar_url, banned_at, archived_at, member:profiles!invite_codes_used_by_fkey(id, username, first_name, last_name, avatar_url, banned_at, is_admin)",
      )
      .order("created_at", { ascending: false });

    if (loadError) {
      setError(danishAuthError(loadError.message));
      return;
    }

    const rows = (data ?? []).map((row) => {
      const memberRaw = row.member;
      const member = Array.isArray(memberRaw) ? (memberRaw[0] ?? null) : memberRaw;
      return { ...row, member };
    });

    setCodes(rows);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadCodes();
    }
  }, [isAdmin, loadCodes]);

  if (loading) {
    return (
      <SiteShell>
        <PageStatus>Indlæser…</PageStatus>
      </SiteShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const unused = codes.filter((invite) => !invite.used_at);
  const used = codes.filter(
    (invite) =>
      Boolean(invite.used_at) &&
      !invite.archived_at &&
      (Boolean(invite.used_by) || Boolean(invite.banned_at)),
  );
  const archived = codes.filter((invite) => Boolean(invite.archived_at));

  async function handleCreate() {
    setError(null);
    setInfo(null);
    setWorking(true);
    const { data, error: createError } = await supabase.rpc("create_invite_code");
    setWorking(false);

    if (createError) {
      setError(danishAuthError(createError.message));
      return;
    }

    setInfo(`Ny kode: ${data}`);
    setShowUnused(true);
    await loadCodes();
  }

  async function handleRevoke(id: string) {
    setError(null);
    setInfo(null);
    const { error: revokeError } = await supabase.rpc("revoke_invite_code", {
      p_id: id,
    });

    if (revokeError) {
      setError(danishAuthError(revokeError.message));
      return;
    }

    await loadCodes();
  }

  async function handleBan(invite: InviteCode) {
    if (!invite.used_by) return;

    const name = [
      invite.member_first_name ?? invite.member?.first_name,
      invite.member_last_name ?? invite.member?.last_name,
    ]
      .filter(Boolean)
      .join(" ");
    const label =
      name ||
      invite.member_username ||
      invite.member?.username ||
      "dette medlem";

    setError(null);
    setInfo(null);
    const { error: banError } = await supabase.rpc("ban_member", {
      p_user_id: invite.used_by,
    });

    setPendingBanId(null);

    if (banError) {
      setError(danishAuthError(banError.message));
      return;
    }

    setInfo(
      `${label} er spærret. Brugernavnet kan bruges igen med en ny invitationskode.`,
    );
    await loadCodes();
  }

  async function handleReset(invite: InviteCode) {
    if (!invite.used_by) return;

    const name = [
      invite.member_first_name ?? invite.member?.first_name,
      invite.member_last_name ?? invite.member?.last_name,
    ]
      .filter(Boolean)
      .join(" ");
    const label =
      name ||
      invite.member_username ||
      invite.member?.username ||
      "dette medlem";

    setError(null);
    setInfo(null);
    const { data, error: resetError } = await supabase.rpc(
      "create_password_reset_code",
      { p_user_id: invite.used_by },
    );

    setPendingResetId(null);

    if (resetError) {
      setError(danishAuthError(resetError.message));
      return;
    }

    if (typeof data !== "string" || !data) {
      setError("Nulstillingskoden kunne ikke oprettes.");
      return;
    }

    setIssuedReset({ label, code: data });
    setInfo(
      `Nulstillingskode til ${label}: ${data}. Giv den personligt — den virker i 24 timer.`,
    );
  }

  async function handleArchive(id: string) {
    setError(null);
    setInfo(null);
    const { error: archiveError } = await supabase.rpc("archive_invite", {
      p_id: id,
    });

    if (archiveError) {
      setError(danishAuthError(archiveError.message));
      return;
    }

    setInfo("Flyttet til arkiv.");
    await loadCodes();
  }

  async function handleUnarchive(id: string) {
    setError(null);
    setInfo(null);
    const { error: unarchiveError } = await supabase.rpc("unarchive_invite", {
      p_id: id,
    });

    if (unarchiveError) {
      setError(danishAuthError(unarchiveError.message));
      return;
    }

    setInfo("Hentet tilbage fra arkiv.");
    await loadCodes();
  }

  async function handleCopy(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    window.setTimeout(() => setCopied(null), 1500);
  }

  async function handleBootstrap() {
    setError(null);
    setWorking(true);
    const { data, error: bootstrapError } = await supabase.rpc("bootstrap_admin");
    setWorking(false);

    if (bootstrapError) {
      setError(danishAuthError(bootstrapError.message));
      return;
    }

    if (!data) {
      setError("Der er allerede en administrator.");
      return;
    }

    await refreshProfile();
    setInfo("Du er nu administrator og kan oprette invitationskoder.");
  }

  return (
    <SiteShell>
      <Page className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
          Administration
        </p>
        <h1 className="mt-2 font-display text-6xl tracking-wide">Invitationer</h1>
        <p className="mt-2 max-w-xl text-sm text-line/65">
          Hver kode kan kun bruges én gang. Når den er brugt, kan du se hvem der
          er med, spærre adgangen, nulstille en glemt adgangskode, eller rydde
          dem fra oversigten til arkivet.
        </p>

        {!isAdmin ? (
          <section className="mt-10 rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-8">
            <p className="text-sm text-line/75">
              Der er endnu ikke sat en administrator. Hvis det er din klub, kan
              du overtage rollen her — kun den første kan gøre det.
            </p>
            <button
              type="button"
              onClick={() => void handleBootstrap()}
              disabled={working}
              className="mt-6 rounded-full bg-ball px-6 py-3 text-sm font-semibold text-court disabled:opacity-60"
            >
              {working ? "Arbejder…" : "Bliv administrator"}
            </button>
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
          </section>
        ) : (
          <>
            <AdminPushBroadcast />

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={working}
                className="rounded-full bg-ball px-6 py-3 text-sm font-semibold text-court disabled:opacity-60"
              >
                {working ? "Opretter…" : "Opret invitationskode"}
              </button>
            </div>

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
            {issuedReset ? (
              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-ball/25 bg-ball/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ball">
                    Nulstillingskode
                  </p>
                  <p className="mt-1 font-mono text-lg tracking-wider text-line">
                    {issuedReset.code}
                  </p>
                  <p className="mt-1 text-xs text-line/55">
                    Til {issuedReset.label} · gyldig 24 timer · én gang
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy(issuedReset.code)}
                  className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                >
                  {copied === issuedReset.code ? "Kopieret" : "Kopiér"}
                </button>
              </div>
            ) : null}

            <AdminFold
              title="Ledige koder"
              count={unused.length}
              open={showUnused}
              onToggle={() => setShowUnused((open) => !open)}
            >
            <ul className="mt-4 space-y-3">
              {unused.length === 0 ? (
                <li className="rounded-2xl border border-line/10 bg-court-mid/60 px-5 py-4 text-sm text-line/60">
                  Ingen ledige koder.
                </li>
              ) : (
                unused.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex flex-col gap-3 rounded-2xl border border-line/10 bg-court-mid/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-mono text-lg tracking-wider text-ball">
                        {invite.code}
                      </p>
                      <p className="mt-1 text-xs text-line/55">
                        Oprettet {formatWhen(invite.created_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopy(invite.code)}
                        className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                      >
                        {copied === invite.code ? "Kopieret" : "Kopiér"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRevoke(invite.id)}
                        className="rounded-full border border-red-400/30 px-4 py-2 text-xs font-semibold text-red-300"
                      >
                        Tilbagekald
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
            </AdminFold>

            <AdminFold
              title="Medlemmer"
              count={used.length}
              open={showMembers}
              onToggle={() => setShowMembers((open) => !open)}
            >
            <ul className="mt-4 space-y-3">
              {used.length === 0 ? (
                <li className="rounded-2xl border border-line/10 bg-court-mid/60 px-5 py-4 text-sm text-line/60">
                  Ingen medlemmer i oversigten.
                </li>
              ) : (
                used.map((invite) => {
                  const { firstName, username, avatar, banned, fullName } =
                    memberLabel(invite);
                  const confirmingBan = pendingBanId === invite.id;
                  const confirmingReset = pendingResetId === invite.id;
                  const confirming = confirmingBan || confirmingReset;

                  return (
                    <li
                      key={invite.id}
                      className="flex flex-col gap-4 rounded-2xl border border-line/10 bg-court-mid/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        {avatar ? (
                          <img
                            src={avatar}
                            alt={fullName || "Profilbillede"}
                            className="h-14 w-14 rounded-full object-cover ring-2 ring-ball/30"
                          />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-court text-sm font-semibold text-line/50 ring-2 ring-line/10">
                            {(firstName?.[0] ?? "?").toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-base font-semibold text-line">
                            {fullName || "Ukendt navn"}
                          </p>
                          <p className="text-sm text-line/70">
                            {username ? `@${username}` : "Intet brugernavn"}
                          </p>
                          <p className="mt-1 text-xs text-line/50">
                            {banned
                              ? `Spærret ${formatWhen(invite.banned_at ?? invite.member?.banned_at ?? null)}`
                              : `Aktiv · tilmeldt ${formatWhen(invite.used_at)}`}
                            {" · "}
                            <span className="font-mono tracking-wider">
                              {invite.code}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-stretch gap-2 sm:items-end">
                        {banned ? (
                          <span className="rounded-full border border-red-400/30 px-4 py-2 text-center text-xs font-semibold text-red-300">
                            Spærret
                          </span>
                        ) : confirmingReset ? (
                          <>
                            <p className="text-xs text-line/70">
                              Opret nulstillingskode?
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setPendingResetId(null)}
                                className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                              >
                                Annuller
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleReset(invite)}
                                className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court"
                              >
                                Ja, opret
                              </button>
                            </div>
                          </>
                        ) : confirmingBan ? (
                          <>
                            <p className="text-xs text-line/70">Er du sikker?</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setPendingBanId(null)}
                                className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                              >
                                Annuller
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleBan(invite)}
                                className="rounded-full bg-red-400 px-4 py-2 text-xs font-semibold text-court"
                              >
                                Ja, spær
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setPendingBanId(null);
                                setPendingResetId(invite.id);
                              }}
                              className="rounded-full border border-ball/40 px-4 py-2 text-xs font-semibold text-ball"
                            >
                              Nulstil kode
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPendingResetId(null);
                                setPendingBanId(invite.id);
                              }}
                              className="rounded-full border border-red-400/30 px-4 py-2 text-xs font-semibold text-red-300"
                            >
                              Spær adgang
                            </button>
                          </>
                        )}
                        {!confirming ? (
                          <button
                            type="button"
                            onClick={() => void handleArchive(invite.id)}
                            className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold text-line/80"
                          >
                            Ryd
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
            </AdminFold>

            <AdminFold
              title="Arkiv"
              count={archived.length}
              open={showArchive}
              onToggle={() => setShowArchive((open) => !open)}
            >
              <ul className="mt-4 space-y-3">
                {archived.length === 0 ? (
                  <li className="rounded-2xl border border-line/10 bg-court-mid/60 px-5 py-4 text-sm text-line/60">
                    Arkivet er tomt.
                  </li>
                ) : (
                  archived.map((invite) => {
                    const { firstName, username, avatar, banned, fullName } =
                      memberLabel(invite);
                    const deleted = !invite.used_by && !banned;

                    return (
                      <li
                        key={invite.id}
                        className="flex flex-col gap-4 rounded-2xl border border-dashed border-line/15 bg-court-mid/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-4">
                          {avatar ? (
                            <img
                              src={avatar}
                              alt={fullName || "Profilbillede"}
                              className="h-14 w-14 rounded-full object-cover opacity-80 ring-2 ring-line/15"
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-court text-sm font-semibold text-line/50 ring-2 ring-line/10">
                              {(firstName?.[0] ?? "?").toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-base font-semibold text-line/85">
                              {fullName || "Ukendt navn"}
                            </p>
                            <p className="text-sm text-line/60">
                              {username ? `@${username}` : "Intet brugernavn"}
                            </p>
                            <p className="mt-1 text-xs text-line/45">
                              {banned
                                ? "Spærret · "
                                : deleted
                                  ? "Slettet konto · "
                                  : ""}
                              Arkiveret {formatWhen(invite.archived_at)}
                              {" · "}
                              <span className="font-mono tracking-wider">
                                {invite.code}
                              </span>
                            </p>
                          </div>
                        </div>
                        {deleted ? null : (
                        <button
                          type="button"
                          onClick={() => void handleUnarchive(invite.id)}
                          className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                        >
                          Gendan
                        </button>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            </AdminFold>
          </>
        )}
      </Page>
    </SiteShell>
  );
}
