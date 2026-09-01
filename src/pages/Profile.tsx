import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { MatchRecord } from "../components/MatchRecord";
import { PushNotifications } from "../components/PushNotifications";
import { ChatBubbleIcon } from "../components/ChatBubbleIcon";
import { MemberAvatar, MemberNameLink } from "../components/MemberAvatar";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  emptyPlayerRecord,
  fetchPlayerRecord,
  type PlayerRecord,
} from "../lib/match";
import {
  PROFILE_SELECT,
  REQUEST_SELECT,
  attachPartner,
  attachRequestPeople,
  fetchMembersByIds,
  fullName,
  profileMatchesPath,
  type PartnershipRequest,
  type PublicProfile,
} from "../lib/profile";
import { messagePath } from "../lib/messages";
import { supabase } from "../lib/supabase";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function fileExtension(file: File) {
  const fromType = file.type.split("/")[1];
  if (fromType === "jpeg") return "jpg";
  if (fromType === "png" || fromType === "webp" || fromType === "gif") {
    return fromType;
  }
  return "jpg";
}

export function Profile() {
  const { username: usernameParam } = useParams();
  const { user, loading, username: myUsername, setOwnAvatar } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [record, setRecord] = useState<PlayerRecord>(emptyPlayerRecord());
  const [incoming, setIncoming] = useState<PartnershipRequest[]>([]);
  const [outgoing, setOutgoing] = useState<PartnershipRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewerPartnerId, setViewerPartnerId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const isOwn = Boolean(
    user &&
      (!usernameParam ||
        usernameParam.toLowerCase() === (myUsername ?? "").toLowerCase()),
  );

  const load = useCallback(async () => {
    if (!user) return;

    setError(null);
    setMissing(false);

    const { data: me } = await supabase
      .from("profiles")
      .select("partner_id")
      .eq("id", user.id)
      .maybeSingle();
    setViewerPartnerId(me?.partner_id ?? null);

    let query = supabase.from("profiles").select(PROFILE_SELECT);
    if (usernameParam && !isOwn) {
      query = query
        .eq("username", usernameParam.toLowerCase())
        .is("banned_at", null);
    } else {
      query = query.eq("id", user.id);
    }

    const { data, error: loadError } = await query.maybeSingle();
    if (loadError) {
      setError(danishAuthError(loadError.message));
      return;
    }
    if (!data) {
      setMissing(true);
      setProfile(null);
      setRecord(emptyPlayerRecord());
      return;
    }

    const [{ data: requestRows }, nextRecord] = await Promise.all([
      supabase
        .from("partnership_requests")
        .select(REQUEST_SELECT)
        .or(
          isOwn
            ? `requester_id.eq.${user.id},recipient_id.eq.${user.id}`
            : `and(requester_id.eq.${user.id},recipient_id.eq.${data.id}),and(requester_id.eq.${data.id},recipient_id.eq.${user.id})`,
        ),
      fetchPlayerRecord(data.id).catch(() => emptyPlayerRecord()),
    ]);
    setRecord(nextRecord);

    const people = await fetchMembersByIds([
      data.partner_id,
      ...(requestRows ?? []).flatMap((row) => [
        row.requester_id,
        row.recipient_id,
      ]),
    ]);

    const mapped = attachPartner(data, people);
    setProfile(mapped);
    setFirstName(mapped.first_name ?? "");
    setLastName(mapped.last_name ?? "");
    setBio(mapped.bio ?? "");

    const requests = (requestRows ?? []).map((row) =>
      attachRequestPeople(row, people),
    );
    setIncoming(requests.filter((row) => row.recipient_id === user.id));
    setOutgoing(requests.filter((row) => row.requester_id === user.id));
  }, [isOwn, user, usernameParam]);

  useEffect(() => {
    if (!loading && user) {
      void load();
    }
  }, [load, loading, user]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  if (loading) {
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

  if (missing) {
    return (
      <SiteShell>
        <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col justify-center px-6 pb-16">
          <h1 className="font-display text-5xl">Ikke fundet</h1>
          <p className="mt-2 text-sm text-line/65">
            Der findes ikke et medlem med det brugernavn.
          </p>
          <Link to="/medlemmer" className="mt-6 text-sm font-semibold text-ball">
            Tilbage til medlemslisten
          </Link>
        </main>
      </SiteShell>
    );
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setError(null);
    setInfo(null);
    setSaving(true);

    if (avatarFile) {
      if (avatarFile.size > MAX_AVATAR_BYTES) {
        setSaving(false);
        setError("Profilbilledet må højst være 2 MB.");
        return;
      }

      const path = `${user.id}/avatar.${fileExtension(avatarFile)}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });

      if (uploadError) {
        setSaving(false);
        setError(uploadError.message);
        return;
      }

      const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarResult = await setOwnAvatar(
        `${publicUrl.publicUrl}?t=${Date.now()}`,
      );
      if (avatarResult.error) {
        setSaving(false);
        setError(danishAuthError(avatarResult.error));
        return;
      }
    }

    const { error: saveError } = await supabase.rpc("update_own_profile", {
      p_first_name: firstName,
      p_last_name: lastName,
      p_bio: bio,
    });
    setSaving(false);

    if (saveError) {
      setError(danishAuthError(saveError.message));
      return;
    }

    setEditing(false);
    setAvatarFile(null);
    setInfo("Profilen er gemt.");
    await load();
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

  async function handleDecline(requestId: string) {
    setError(null);
    setInfo(null);
    const { error: declineError } = await supabase.rpc("decline_partnership", {
      p_request_id: requestId,
    });
    if (declineError) {
      setError(danishAuthError(declineError.message));
      return;
    }
    setInfo("Anmodningen er afvist.");
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

  async function handleRemovePartner() {
    setError(null);
    setInfo(null);
    const { error: removeError } = await supabase.rpc("remove_partner");
    setConfirmRemove(false);
    if (removeError) {
      setError(danishAuthError(removeError.message));
      return;
    }
    setInfo("Partnerskabet er fjernet.");
    await load();
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    if (!user || !isOwn) return;
    setError(null);
    setInfo(null);

    if (newPassword !== confirmPassword) {
      setError("Adgangskoderne er ikke ens.");
      return;
    }

    if (newPassword.length < 6) {
      setError(danishAuthError("PASSWORD_TOO_SHORT"));
      return;
    }

    setSavingPassword(true);
    const { error: passwordError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setSavingPassword(false);

    if (passwordError) {
      setError(danishAuthError(passwordError.message));
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setInfo("Adgangskoden er opdateret.");
  }

  const partner = profile?.partner ?? null;
  const pendingIncoming = incoming[0] ?? null;
  const pendingOutgoing = outgoing[0] ?? null;
  const viewerHasPartner = Boolean(viewerPartnerId);

  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-6 pb-16">
        {error ? (
          <p className="mt-6 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-6 text-sm text-ball" role="status">
            {info}
          </p>
        ) : null}

        {profile && isOwn && incoming.length > 0 ? (
          <section className="mt-8 rounded-3xl border border-ball/25 bg-ball/5 p-6">
            <h2 className="font-display text-2xl tracking-wide">
              Partnerskabsanmodninger
            </h2>
            <ul className="mt-4 space-y-3">
              {incoming.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    {request.requester ? (
                      <MemberAvatar person={request.requester} size="sm" />
                    ) : null}
                    <div>
                      {request.requester ? (
                        <MemberNameLink person={request.requester} />
                      ) : (
                        <span>Ukendt</span>
                      )}
                      <p className="text-xs text-line/55">vil være din partner</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDecline(request.id)}
                      className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                    >
                      Afvis
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAccept(request.id)}
                      className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court"
                    >
                      Acceptér
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {profile ? (
          <section className="relative mt-8 rounded-3xl border border-line/10 bg-court-mid/80 p-8">
            {isOwn && !editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Rediger profil"
                title="Rediger profil"
                className="absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-full border border-line/20 text-line/80 transition hover:border-ball/50 hover:text-ball"
              >
                <PencilIcon />
              </button>
            ) : !isOwn && profile.username ? (
              <Link
                to={messagePath(profile.username)}
                aria-label="Send besked"
                title="Send besked"
                className="absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-full border border-line/20 text-ball transition hover:border-ball/50"
              >
                <ChatBubbleIcon className="h-4 w-4" />
              </Link>
            ) : null}
            <div
              className={`flex items-start gap-4 ${
                (isOwn && !editing) || (!isOwn && profile.username) ? "pr-12" : ""
              }`}
            >
              <MemberAvatar
                size="lg"
                person={{
                  ...profile,
                  avatar_url: avatarPreview ?? profile.avatar_url,
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
                  {isOwn ? "Din profil" : "Medlem"}
                </p>
                <h1 className="mt-1 font-display text-4xl leading-none tracking-wide sm:text-5xl">
                  {fullName(profile)}
                </h1>
                {!editing && (profile.bio || isOwn) ? (
                  <BioBubble text={profile.bio} showEmpty={isOwn} />
                ) : null}
              </div>
            </div>

            <div className="mt-6">
              <MatchRecord record={record} />
              {profile.username ? (
                <Link
                  to={profileMatchesPath(profile.username)}
                  className="mt-3 flex w-full items-center justify-center rounded-full bg-ball px-4 py-2.5 text-xs font-semibold text-court"
                >
                  Se kampe
                </Link>
              ) : null}
            </div>
            {!isOwn && profile.username ? (
              <Link
                to={messagePath(profile.username)}
                className="mt-6 flex w-full items-center justify-center rounded-full border border-ball/50 px-4 py-2.5 text-xs font-semibold text-ball"
              >
                Send besked
              </Link>
            ) : null}
            {isOwn ? (
              <div className="mt-6">
                <PushNotifications />
              </div>
            ) : null}

            {isOwn && editing ? (
              <>
              <form
                onSubmit={(event) => void handleSave(event)}
                className="mt-6 space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-line/80">
                    Fornavn
                    <input
                      required
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
                    />
                  </label>
                  <label className="block text-sm font-medium text-line/80">
                    Efternavn
                    <input
                      required
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium text-line/80">
                  Profilbillede
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                      setAvatarFile(file);
                      setAvatarPreview(file ? URL.createObjectURL(file) : null);
                    }}
                    className="mt-2 w-full text-sm text-line/70 file:mr-4 file:rounded-full file:border-0 file:bg-ball file:px-4 file:py-2 file:text-sm file:font-semibold file:text-court"
                  />
                </label>
                <label className="block text-sm font-medium text-line/80">
                  Bio
                  <textarea
                    value={bio}
                    maxLength={500}
                    rows={4}
                    onChange={(event) => setBio(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setAvatarFile(null);
                      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                      setAvatarPreview(null);
                      setFirstName(profile.first_name ?? "");
                      setLastName(profile.last_name ?? "");
                      setBio(profile.bio ?? "");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                  >
                    Annuller
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court disabled:opacity-60"
                  >
                    {saving ? "Gemmer…" : "Gem"}
                  </button>
                </div>
              </form>
              <form
                onSubmit={(event) => void handleChangePassword(event)}
                className="mt-6 space-y-3 rounded-2xl border border-line/15 bg-court px-5 py-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ball">
                  Adgangskode
                </p>
                <label className="block text-sm font-medium text-line/80">
                  Ny adgangskode
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-line/15 bg-court-mid px-4 py-3 outline-none focus:border-ball"
                  />
                </label>
                <label className="block text-sm font-medium text-line/80">
                  Gentag adgangskode
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    className="mt-2 w-full rounded-2xl border border-line/15 bg-court-mid px-4 py-3 outline-none focus:border-ball"
                  />
                </label>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold disabled:opacity-60"
                >
                  {savingPassword ? "Gemmer…" : "Skift adgangskode"}
                </button>
              </form>
              </>
            ) : (
              <div className="mt-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
                    Partner
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {partner ? (
                      <>
                        <span className="text-sm text-line/80">
                          <MemberNameLink person={partner} />
                        </span>
                        {isOwn ? (
                          confirmRemove ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-line/70">
                                Fjerne partner?
                              </span>
                              <button
                                type="button"
                                onClick={() => setConfirmRemove(false)}
                                className="rounded-full border border-line/20 px-3 py-1.5 text-xs font-semibold"
                              >
                                Annuller
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRemovePartner()}
                                className="rounded-full bg-red-400 px-3 py-1.5 text-xs font-semibold text-court"
                              >
                                Ja, fjern
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmRemove(true)}
                              className="rounded-full border border-red-400/30 px-3 py-1.5 text-xs font-semibold text-red-300"
                            >
                              Fjern partner
                            </button>
                          )
                        ) : null}
                      </>
                    ) : (
                      <span className="text-sm text-line/80">
                        {isOwn ? (
                          <Link
                            to="/find-partner"
                            className="font-semibold text-ball hover:underline"
                          >
                            Find partner
                          </Link>
                        ) : (
                          "Ingen"
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!isOwn && !partner && !viewerHasPartner ? (
              <div className="mt-6">
                {pendingIncoming ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDecline(pendingIncoming.id)}
                      className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                    >
                      Afvis
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAccept(pendingIncoming.id)}
                      className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court"
                    >
                      Acceptér anmodning
                    </button>
                  </div>
                ) : pendingOutgoing ? (
                  <button
                    type="button"
                    onClick={() => void handleCancel(pendingOutgoing.id)}
                    className="rounded-full border border-line/20 px-4 py-2 text-xs font-semibold"
                  >
                    Annuller anmodning
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleRequest(profile.id)}
                    className="rounded-full bg-ball px-4 py-2 text-xs font-semibold text-court"
                  >
                    Anmod om partnerskab
                  </button>
                )}
              </div>
            ) : null}
          </section>
        ) : (
          <p className="mt-8 text-sm text-line/60">Indlæser profil…</p>
        )}
      </main>
    </SiteShell>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function BioBubble({
  text,
  showEmpty,
}: {
  text: string | null;
  showEmpty: boolean;
}) {
  if (!text && !showEmpty) return null;

  return (
    <div className="mt-2 flex min-w-0 max-w-sm items-start">
      <span
        aria-hidden
        className="mt-2.5 h-0 w-0 shrink-0 border-y-[6px] border-y-transparent border-r-[7px] border-r-court"
      />
      <p
        className={`min-w-0 rounded-2xl rounded-tl-md bg-court px-3 py-1.5 text-sm leading-relaxed whitespace-pre-wrap ${
          text ? "text-line/90" : "text-line/50 italic"
        }`}
      >
        {text || "Ingen bio endnu."}
      </p>
    </div>
  );
}
