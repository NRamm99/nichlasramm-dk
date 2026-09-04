import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { danishAuthError, normalizeInviteCode } from "../lib/authErrors";
import { isValidUsername, normalizeUsername } from "../lib/username";
import { supabase } from "../lib/supabase";
import { SiteShell } from "../components/SiteShell";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { fieldClass } from "../components/ui/Field";
import { Page } from "../components/ui/Page";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function fileExtension(file: File) {
  const fromType = file.type.split("/")[1];
  if (fromType === "jpeg") return "jpg";
  if (fromType === "png" || fromType === "webp" || fromType === "gif") {
    return fromType;
  }
  return "jpg";
}

export function Register() {
  const { user, loading, signUp, setOwnAvatar } = useAuth();
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  function handleAvatarChange(file: File | null) {
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }

    if (!file) {
      setAvatarFile(null);
      setAvatarPreview(null);
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const code = normalizeInviteCode(inviteCode);
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const normalizedUsername = normalizeUsername(username);

    if (!code) {
      setError("Du skal indtaste en invitationskode.");
      return;
    }

    if (!isValidUsername(normalizedUsername)) {
      setError(danishAuthError("USERNAME_INVALID"));
      return;
    }

    if (!trimmedFirst || !trimmedLast) {
      setError("Fornavn og efternavn er påkrævet.");
      return;
    }

    if (!avatarFile) {
      setError("Vælg et profilbillede.");
      return;
    }

    if (avatarFile.size > MAX_AVATAR_BYTES) {
      setError("Profilbilledet må højst være 2 MB.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Adgangskoderne er ikke ens.");
      return;
    }

    if (password.length < 6) {
      setError("Adgangskoden skal være mindst 6 tegn.");
      return;
    }

    setSubmitting(true);
    const result = await signUp(normalizedUsername, password, code, {
      firstName: trimmedFirst,
      lastName: trimmedLast,
    });

    if (result.error) {
      setSubmitting(false);
      setError(danishAuthError(result.error));
      return;
    }

    if (result.userId) {
      const path = `${result.userId}/avatar.${fileExtension(avatarFile)}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });

      if (uploadError) {
        setSubmitting(false);
        setError(
          `Kontoen er oprettet, men billedet kunne ikke gemmes: ${uploadError.message}`,
        );
        return;
      }

      const { data: publicUrl } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);
      const avatarResult = await setOwnAvatar(publicUrl.publicUrl);
      if (avatarResult.error) {
        setSubmitting(false);
        setError(danishAuthError(avatarResult.error));
        return;
      }
    }

    setSubmitting(false);
    navigate("/", { replace: true });
  }

  return (
    <SiteShell>
      <Page center>
        <form onSubmit={(event) => void handleSubmit(event)} className="w-full max-w-md">
          <Card className="p-6 sm:p-8">
          <p className="ui-label">Lukket klub</p>
          <h1 className="mt-2 font-display text-4xl tracking-wide sm:text-5xl">Opret konto</h1>
          <p className="mt-2 text-sm text-line/55">
            Du skal bruge en invitationskode. Vælg et brugernavn. Navn og
            billede vises til administratoren.
          </p>

          <label className="mt-8 block text-left text-sm font-medium text-line/80">
            Invitationskode
            <input
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              placeholder="PBR-XXXXXXXX"
              className={fieldClass("tracking-[0.12em]")}
            />
          </label>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-left text-sm font-medium text-line/80">
              Fornavn
              <input
                type="text"
                required
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className={fieldClass()}
              />
            </label>
            <label className="block text-left text-sm font-medium text-line/80">
              Efternavn
              <input
                type="text"
                required
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className={fieldClass()}
              />
            </label>
          </div>

          <label className="mt-4 block text-left text-sm font-medium text-line/80">
            Profilbillede
            <input
              type="file"
              required
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(event) =>
                handleAvatarChange(event.target.files?.[0] ?? null)
              }
              className="mt-2 w-full text-sm text-line/70 file:mr-4 file:rounded-full file:border-0 file:bg-ball file:px-4 file:py-2 file:text-sm file:font-semibold file:text-court"
            />
          </label>

          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt="Forhåndsvisning af profilbillede"
              className="mt-3 h-20 w-20 rounded-full object-cover ring-2 ring-ball/40"
            />
          ) : null}

          <label className="mt-4 block text-left text-sm font-medium text-line/80">
            Brugernavn
            <input
              type="text"
              required
              autoComplete="username"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={fieldClass()}
            />
          </label>

          <label className="mt-4 block text-left text-sm font-medium text-line/80">
            Adgangskode
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass()}
            />
          </label>

          <label className="mt-4 block text-left text-sm font-medium text-line/80">
            Gentag adgangskode
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className={fieldClass()}
            />
          </label>

          {error ? (
            <p className="mt-4 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={submitting} block className="mt-8 py-3">
            {submitting ? "Opretter konto…" : "Opret konto"}
          </Button>

          <p className="mt-6 text-center text-sm text-line/60">
            Allerede medlem?{" "}
            <Link to="/login" className="font-semibold text-ball hover:underline">
              Log ind
            </Link>
          </p>
          </Card>
        </form>
      </Page>
    </SiteShell>
  );
}
