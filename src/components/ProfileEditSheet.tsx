import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Field, fieldClass } from "./ui/Field";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Sheet } from "./ui/Sheet";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import type { PublicProfile } from "../lib/profile";
import {
  fromPlayStyleChoice,
  HANDED_OPTIONS,
  SIDE_OPTIONS,
  toPlayStyleChoice,
  type PlayStyleChoice,
} from "../lib/profilePlayStyle";
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

export function ProfileEditSheet({
  open,
  onClose,
  profile,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: PublicProfile;
  onSaved: () => Promise<void> | void;
}) {
  if (!open) return null;
  return (
    <ProfileEditForm profile={profile} onClose={onClose} onSaved={onSaved} />
  );
}

function ProfileEditForm({
  profile,
  onClose,
  onSaved,
}: {
  profile: PublicProfile;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { user, setOwnAvatar, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState(profile.first_name ?? "");
  const [lastName, setLastName] = useState(profile.last_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [handed, setHanded] = useState<PlayStyleChoice>(
    toPlayStyleChoice(profile.handed),
  );
  const [preferredSide, setPreferredSide] = useState<PlayStyleChoice>(
    toPlayStyleChoice(profile.preferred_side),
  );
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

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
      p_handed: fromPlayStyleChoice(handed),
      p_preferred_side: fromPlayStyleChoice(preferredSide),
    });
    setSaving(false);

    if (saveError) {
      setError(danishAuthError(saveError.message));
      return;
    }

    setInfo("Profilen er gemt.");
    await Promise.all([onSaved(), refreshProfile()]);
    onClose();
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
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
    if (!user) return;
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

  return (
    <Sheet
      open
      onClose={onClose}
      title="Rediger profil"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="submit"
            form="profile-edit-form"
            disabled={saving}
            block
            className="sm:flex-1"
          >
            {saving ? "Gemmer…" : "Gem"}
          </Button>
          <Button
            variant="secondary"
            onClick={onClose}
            block
            className="sm:flex-1"
          >
            Annuller
          </Button>
        </div>
      }
    >
      {error ? (
        <p className="mb-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="mb-3 text-sm text-line/70" role="status">
          {info}
        </p>
      ) : null}

      <form
        id="profile-edit-form"
        onSubmit={(event) => void handleSave(event)}
        className="space-y-4"
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
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt=""
              className="mt-3 h-20 w-20 rounded-full object-cover ring-2 ring-ball/30"
            />
          ) : null}
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
        <div className="space-y-2">
          <p className="text-sm font-medium text-line/80">Hånd</p>
          <SegmentedControl
            block
            label="Hånd"
            value={handed}
            onChange={setHanded}
            options={HANDED_OPTIONS}
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-line/80">Foretrukken side</p>
          <SegmentedControl
            block
            label="Foretrukken side"
            value={preferredSide}
            onChange={setPreferredSide}
            options={SIDE_OPTIONS}
          />
          <p className="text-xs text-line/50">
            Den side af banen du helst spiller, set fra jeres bane mod nettet.
          </p>
        </div>
      </form>

      <form
        onSubmit={(event) => void handleChangePassword(event)}
        className="mt-6 space-y-3"
      >
        <Card className="space-y-3 bg-court px-5 py-4">
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
              onChange={(event) => setConfirmPassword(event.target.value)}
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
        <Card className="space-y-3 border-red-400/25 bg-court px-5 py-4">
          <p className="ui-label text-red-300">Slet konto</p>
          {!confirmingDelete ? (
            <>
              <p className="text-sm text-line/65">
                Kontoen forsvinder permanent. Kampe du har spillet bliver
                stående med dit navn.
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
                  onChange={(event) => setDeleteConfirm(event.target.value)}
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
                  onChange={(event) => setDeletePassword(event.target.value)}
                  className={fieldClass(
                    "border-red-400/20 bg-court-mid focus:border-red-300",
                  )}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => resetDeleteForm()}>
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
    </Sheet>
  );
}
