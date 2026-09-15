import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { MatchFinderSheet } from "../components/MatchFinderSheet";
import { MatchRecord } from "../components/MatchRecord";
import { RatingInline } from "../components/RatingValue";
import { PushNotifications } from "../components/PushNotifications";
import { MemberAvatar, MemberNameLink } from "../components/MemberAvatar";
import { SiteShell } from "../components/SiteShell";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, fieldClass } from "../components/ui/Field";
import { ListGroup, ListRow } from "../components/ui/ListGroup";
import { BackLink, Page, PageHeader } from "../components/ui/Page";
import {
  Skeleton,
  SkeletonCard,
  SkeletonCircle,
  SkeletonListRows,
  SkeletonRegion,
} from "../components/ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import {
  emptyPlayerRecord,
  fetchPlayerRecord,
  type PlayerRecord,
} from "../lib/match";
import {
  effectiveSlots,
  emptyMemberPrefs,
  fetchMatchFinderRows,
  formatSlots,
  groupPreferences,
  temporaryActive,
  type MemberPrefs,
} from "../lib/matchFinder";
import {
  emptyRatingSummary,
  fetchPlayerRatingsByIds,
  fetchPlayerRatingSummary,
  type PlayerRating,
  type PlayerRatingSummary,
} from "../lib/rating";
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
const ACCOUNT_DELETE_WORD = "SLET";

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
  const {
    user,
    loading,
    username: myUsername,
    setOwnAvatar,
    signOut,
    refreshProfile,
  } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [record, setRecord] = useState<PlayerRecord>(emptyPlayerRecord());
  const [ratingSummary, setRatingSummary] = useState<PlayerRatingSummary>(
    emptyRatingSummary(),
  );
  const [ratings, setRatings] = useState<Map<string, PlayerRating>>(new Map());
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [matchFinderPrefs, setMatchFinderPrefs] = useState<MemberPrefs>(
    emptyMemberPrefs,
  );
  const [timesSheetOpen, setTimesSheetOpen] = useState(false);

  const isOwn = Boolean(
    user &&
      (!usernameParam ||
        usernameParam.toLowerCase() === (myUsername ?? "").toLowerCase()),
  );

  const loadMatchFinder = useCallback(async () => {
    if (!user || !isOwn) return;
    try {
      const rows = await fetchMatchFinderRows();
      setMatchFinderPrefs(
        groupPreferences(rows).get(user.id) ?? emptyMemberPrefs(),
      );
    } catch {
      setMatchFinderPrefs(emptyMemberPrefs());
    }
  }, [isOwn, user]);

  const load = useCallback(async () => {
    if (!user) return;

    setError(null);
    setMissing(false);
    void loadMatchFinder();

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
      setRatingSummary(emptyRatingSummary());
      setRatings(new Map());
      return;
    }

    const [{ data: requestRows }, nextRecord, nextRating] = await Promise.all([
      supabase
        .from("partnership_requests")
        .select(REQUEST_SELECT)
        .or(
          isOwn
            ? `requester_id.eq.${user.id},recipient_id.eq.${user.id}`
            : `and(requester_id.eq.${user.id},recipient_id.eq.${data.id}),and(requester_id.eq.${data.id},recipient_id.eq.${user.id})`,
        ),
      data.hide_record && !isOwn
        ? Promise.resolve(emptyPlayerRecord())
        : fetchPlayerRecord(data.id).catch(() => emptyPlayerRecord()),
      fetchPlayerRatingSummary(data.id).catch(() => emptyRatingSummary()),
    ]);
    setRecord(nextRecord);
    setRatingSummary(nextRating);

    const peopleIds = [
      data.partner_id,
      ...(requestRows ?? []).flatMap((row) => [
        row.requester_id,
        row.recipient_id,
      ]),
    ];
    const [people, ratingMap] = await Promise.all([
      fetchMembersByIds(peopleIds),
      fetchPlayerRatingsByIds(peopleIds).catch(
        () => new Map<string, PlayerRating>(),
      ),
    ]);
    setRatings(ratingMap);

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
  }, [isOwn, loadMatchFinder, user, usernameParam]);

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

  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  if (loading || (!profile && !missing && !error && user)) {
    return (
      <SiteShell>
        <Page>
          {usernameParam ? <BackLink to="/medlemmer">Medlemmer</BackLink> : null}
          <SkeletonRegion>
            <div className="mt-6 flex items-start gap-4">
              <SkeletonCircle size="7rem" />
              <div className="min-w-0 flex-1 space-y-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-10 w-48 sm:h-12" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <SkeletonCard className="mt-6 p-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-16 w-full" />
            </SkeletonCard>
            <SkeletonCard className="mt-6 px-4 py-4">
              <Skeleton className="h-3 w-16" />
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            </SkeletonCard>
            <div className="mt-6">
              <SkeletonListRows count={3} avatar={false} />
            </div>
          </SkeletonRegion>
        </Page>
      </SiteShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (missing) {
    return (
      <SiteShell>
        <Page>
          <BackLink to="/medlemmer">Medlemmer</BackLink>
          <div className="mt-4">
            <PageHeader
              title="Ikke fundet"
              subtitle="Der findes ikke et medlem med det brugernavn."
            />
          </div>
        </Page>
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
    await Promise.all([load(), refreshProfile()]);
  }

  async function handleHideRecord(hide: boolean) {
    setError(null);
    setProfile((current) =>
      current ? { ...current, hide_record: hide } : current,
    );
    const { error: hideError } = await supabase.rpc("set_hide_record", {
      p_hide: hide,
    });
    if (hideError) {
      setProfile((current) =>
        current ? { ...current, hide_record: !hide } : current,
      );
      setError(danishAuthError(hideError.message));
    }
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

  function resetDeleteForm() {
    setConfirmingDelete(false);
    setDeleteConfirm("");
    setDeletePassword("");
    setDeleting(false);
  }

  async function handleDeleteAccount(event: FormEvent) {
    event.preventDefault();
    if (!user || !isOwn) return;
    setError(null);
    setInfo(null);

    if (deleteConfirm.trim() !== ACCOUNT_DELETE_WORD) {
      setError(danishAuthError("ACCOUNT_DELETE_CONFIRM"));
      return;
    }

    if (!deletePassword) {
      setError(danishAuthError("INVALID_PASSWORD"));
      return;
    }

    setDeleting(true);

    const { data: avatarFiles } = await supabase.storage
      .from("avatars")
      .list(user.id);
    if (avatarFiles?.length) {
      await supabase.storage.from("avatars").remove(
        avatarFiles.map((file) => `${user.id}/${file.name}`),
      );
    }

    const { error: deleteError } = await supabase.rpc("delete_own_account", {
      p_confirm: deleteConfirm.trim(),
      p_password: deletePassword,
    });
    if (deleteError) {
      setDeleting(false);
      setError(danishAuthError(deleteError.message));
      return;
    }

    await signOut();
    navigate("/login", { replace: true });
  }

  const partner = profile?.partner ?? null;
  const pendingIncoming = incoming[0] ?? null;
  const pendingOutgoing = outgoing[0] ?? null;
  const viewerHasPartner = Boolean(viewerPartnerId);
  const mySlots = effectiveSlots(matchFinderPrefs);
  const timesHint =
    mySlots.length === 0
      ? "Ikke sat"
      : `${temporaryActive(matchFinderPrefs) ? "Midlertidigt: " : ""}${formatSlots(mySlots)}`;

  return (
    <SiteShell>
      <Page>
        {!isOwn ? <BackLink to="/medlemmer">Medlemmer</BackLink> : null}
        {error ? (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="text-sm text-line/70" role="status">
            {info}
          </p>
        ) : null}

        {profile && isOwn && incoming.length > 0 ? (
          <Card className="mt-6 p-5">
            <p className="ui-label">Partnerskabsanmodninger</p>
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
                        <MemberNameLink
                          person={request.requester}
                          rating={ratings.get(request.requester.id)?.rating}
                        />
                      ) : (
                        <span>Ukendt</span>
                      )}
                      <p className="text-xs text-line/55">vil være din partner</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="text-xs"
                      onClick={() => void handleDecline(request.id)}
                    >
                      Afvis
                    </Button>
                    <Button
                      className="text-xs"
                      onClick={() => void handleAccept(request.id)}
                    >
                      Acceptér
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {profile ? (
          <>
            <div className="lg:mt-2 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)] lg:items-start lg:gap-10">
            <div>
            <div className="mt-6 flex items-start gap-4">
              <MemberAvatar
                size="lg"
                person={{
                  ...profile,
                  avatar_url: avatarPreview ?? profile.avatar_url,
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="ui-label">{isOwn ? "Din profil" : "Medlem"}</p>
                <h1 className="mt-1 font-display text-4xl leading-none tracking-wide sm:text-5xl lg:text-4xl">
                  {fullName(profile)}
                </h1>
                <div className="mt-2">
                  <RatingInline summary={ratingSummary} />
                </div>
                {!editing && (profile.bio || isOwn) ? (
                  <BioBubble text={profile.bio} showEmpty={isOwn} />
                ) : null}
              </div>
            </div>

            <div className="mt-6">
              <MatchRecord
                record={record}
                hideFromOthers={Boolean(profile.hide_record)}
                onHideFromOthersChange={
                  isOwn ? (hide) => void handleHideRecord(hide) : undefined
                }
                matchesTo={
                  profile.username
                    ? profileMatchesPath(profile.username)
                    : undefined
                }
              />
            </div>

            {!isOwn && profile.username ? (
              <Button
                variant="secondary"
                to={messagePath(profile.username)}
                block
                className="mt-4"
              >
                Send besked
              </Button>
            ) : null}

            </div>
            <div className="min-w-0">

            {isOwn && editing ? (
              <>
                <form
                  onSubmit={(event) => void handleSave(event)}
                  className="mt-6 max-w-xl space-y-4"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Fornavn">
                      <input
                        required
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        className={fieldClass()}
                      />
                    </Field>
                    <Field label="Efternavn">
                      <input
                        required
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        className={fieldClass()}
                      />
                    </Field>
                  </div>
                  <Field label="Profilbillede">
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
                  </Field>
                  <Field label="Bio">
                    <textarea
                      value={bio}
                      maxLength={500}
                      rows={4}
                      onChange={(event) => setBio(event.target.value)}
                      className={fieldClass()}
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
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
                        resetDeleteForm();
                      }}
                    >
                      Annuller
                    </Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? "Gemmer…" : "Gem"}
                    </Button>
                  </div>
                </form>
                <form
                  onSubmit={(event) => void handleChangePassword(event)}
                  className="mt-6 space-y-3"
                >
                  <Card className="space-y-3 px-5 py-4">
                    <p className="ui-label">Adgangskode</p>
                    <Field label="Ny adgangskode">
                      <input
                        type="password"
                        required
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        className={fieldClass("bg-court-mid")}
                      />
                    </Field>
                    <Field label="Gentag adgangskode">
                      <input
                        type="password"
                        required
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        className={fieldClass("bg-court-mid")}
                      />
                    </Field>
                    <Button
                      variant="secondary"
                      type="submit"
                      disabled={savingPassword}
                    >
                      {savingPassword ? "Gemmer…" : "Skift adgangskode"}
                    </Button>
                  </Card>
                </form>
                <form
                  onSubmit={(event) => void handleDeleteAccount(event)}
                  className="mt-4"
                >
                  <Card className="space-y-3 border-red-400/25 px-5 py-4">
                    <p className="ui-label text-red-300">Slet konto</p>
                    {!confirmingDelete ? (
                      <>
                        <p className="text-sm text-line/65">
                          Kontoen forsvinder permanent. Kampe du har spillet
                          bliver stående med dit navn.
                        </p>
                        <Button
                          variant="danger"
                          onClick={() => setConfirmingDelete(true)}
                        >
                          Slet min konto…
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-line/70">
                          Det kan ikke fortrydes. Skriv{" "}
                          <span className="font-semibold text-red-200">
                            {ACCOUNT_DELETE_WORD}
                          </span>{" "}
                          og din adgangskode for at bekræfte.
                        </p>
                        <Field label={`Skriv ${ACCOUNT_DELETE_WORD}`}>
                          <input
                            value={deleteConfirm}
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            onChange={(event) =>
                              setDeleteConfirm(event.target.value)
                            }
                            className={fieldClass(
                              "border-red-400/20 bg-court-mid focus:border-red-300",
                            )}
                          />
                        </Field>
                        <Field label="Adgangskode">
                          <input
                            type="password"
                            autoComplete="current-password"
                            value={deletePassword}
                            onChange={(event) =>
                              setDeletePassword(event.target.value)
                            }
                            className={fieldClass(
                              "border-red-400/20 bg-court-mid focus:border-red-300",
                            )}
                          />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => resetDeleteForm()}
                          >
                            Annuller
                          </Button>
                          <Button
                            variant="danger"
                            type="submit"
                            className="border-0 bg-red-400 text-court hover:bg-red-300"
                            disabled={
                              deleting ||
                              deleteConfirm.trim() !== ACCOUNT_DELETE_WORD ||
                              deletePassword.length === 0
                            }
                          >
                            {deleting ? "Sletter…" : "Slet kontoen permanent"}
                          </Button>
                        </div>
                      </>
                    )}
                  </Card>
                </form>
              </>
            ) : (
              <>
                <p className="ui-label mt-8 mb-2 px-1">Partner</p>
                <ListGroup>
                  {partner ? (
                    <li className="flex min-h-14 items-center gap-3 px-4 py-3">
                      <MemberAvatar person={partner} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold leading-tight">
                          <MemberNameLink
                            person={partner}
                            rating={ratings.get(partner.id)?.rating}
                          />
                        </span>
                        <span className="mt-0.5 block text-sm text-line/55">
                          Fast makker
                        </span>
                      </span>
                      {isOwn ? (
                        confirmRemove ? (
                          <span className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              className="px-3 py-1.5 text-xs"
                              onClick={() => setConfirmRemove(false)}
                            >
                              Annuller
                            </Button>
                            <Button
                              variant="danger"
                              className="border-0 bg-red-400 px-3 py-1.5 text-xs text-court hover:bg-red-300"
                              onClick={() => void handleRemovePartner()}
                            >
                              Ja, fjern
                            </Button>
                          </span>
                        ) : (
                          <Button
                            variant="danger"
                            className="px-3 py-1.5 text-xs"
                            onClick={() => setConfirmRemove(true)}
                          >
                            Fjern
                          </Button>
                        )
                      ) : null}
                    </li>
                  ) : (
                    <ListRow
                      to={isOwn ? "/find-partner" : undefined}
                      icon={<HandshakeIcon />}
                      label={isOwn ? "Find partner" : "Ingen partner"}
                      chevron={isOwn}
                    />
                  )}
                </ListGroup>

                {isOwn ? (
                  <>
                    <p className="ui-label mt-8 mb-2 px-1">Konto</p>
                    <ListGroup>
                      <ListRow
                        onClick={() => setEditing(true)}
                        icon={<PencilIcon />}
                        label="Rediger profil"
                        hint="Navn, billede og info"
                      />
                      <ListRow
                        onClick={() => setTimesSheetOpen(true)}
                        icon={<ClockIcon />}
                        label="Spilletider"
                        hint={timesHint}
                      />
                      <ListRow
                        to="/liga/kampe"
                        icon={<TrophyIcon />}
                        label="Ligakampe"
                        hint="Sæsonens kommende og afsluttede kampe"
                      />
                    </ListGroup>
                    <div className="mt-6">
                      <PushNotifications compact />
                    </div>
                  </>
                ) : null}

                {!isOwn && !partner && !viewerHasPartner ? (
                  <div className="mt-6">
                    {pendingIncoming ? (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => void handleDecline(pendingIncoming.id)}
                        >
                          Afvis
                        </Button>
                        <Button
                          onClick={() => void handleAccept(pendingIncoming.id)}
                        >
                          Acceptér anmodning
                        </Button>
                      </div>
                    ) : pendingOutgoing ? (
                      <Button
                        variant="secondary"
                        onClick={() => void handleCancel(pendingOutgoing.id)}
                      >
                        Annuller anmodning
                      </Button>
                    ) : (
                      <Button onClick={() => void handleRequest(profile.id)}>
                        Anmod om partnerskab
                      </Button>
                    )}
                  </div>
                ) : null}
              </>
            )}
            </div>
            </div>
            {isOwn ? (
              <MatchFinderSheet
                open={timesSheetOpen}
                onClose={() => setTimesSheetOpen(false)}
                prefs={matchFinderPrefs}
                hidden={Boolean(profile.match_finder_hidden)}
                onSaved={() => void loadMatchFinder()}
                onHiddenChange={(hidden) =>
                  setProfile((current) =>
                    current
                      ? { ...current, match_finder_hidden: hidden }
                      : current,
                  )
                }
              />
            ) : null}
          </>
        ) : null}
      </Page>
    </SiteShell>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-5 w-5"
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

function HandshakeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 13 4.5 9.5 8 6l3.5 3.5" />
      <path d="m16 13 3.5-3.5L16 6l-3.5 3.5" />
      <path d="M8.5 14.5 12 18l3.5-3.5" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-5 w-5"
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

function BioBubble({
  text,
  showEmpty,
}: {
  text: string | null;
  showEmpty: boolean;
}) {
  if (!text && !showEmpty) return null;

  return (
    <p
      className={`mt-2 inline-block rounded-full px-3 py-1 text-sm leading-relaxed ${
        text ? "bg-court-mid text-line/80" : "bg-court-mid text-line/50 italic"
      }`}
    >
      {text || "Ingen bio endnu."}
    </p>
  );
}
