import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { danishAuthError, normalizeInviteCode } from "../lib/authErrors";
import { isValidUsername, normalizeUsername } from "../lib/username";
import { supabase } from "../lib/supabase";
import { SiteShell } from "../components/SiteShell";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, fieldClass } from "../components/ui/Field";
import { Page } from "../components/ui/Page";

export function ForgotPassword() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalizedUsername = normalizeUsername(username);
    if (!isValidUsername(normalizedUsername)) {
      setError(danishAuthError("USERNAME_INVALID"));
      return;
    }

    const normalizedCode = normalizeInviteCode(code);
    if (!normalizedCode) {
      setError(danishAuthError("RESET_INVALID"));
      return;
    }

    if (password !== confirmPassword) {
      setError("Adgangskoderne er ikke ens.");
      return;
    }

    if (password.length < 6) {
      setError(danishAuthError("PASSWORD_TOO_SHORT"));
      return;
    }

    setSubmitting(true);
    const { error: resetError } = await supabase.rpc("complete_password_reset", {
      p_username: normalizedUsername,
      p_code: normalizedCode,
      p_password: password,
    });
    setSubmitting(false);

    if (resetError) {
      setError(danishAuthError(resetError.message));
      return;
    }

    navigate("/login", { replace: true, state: { passwordReset: true } });
  }

  return (
    <SiteShell>
      <Page center>
        <form onSubmit={(event) => void handleSubmit(event)} className="w-full max-w-md">
          <Card className="p-6 sm:p-8">
          <p className="ui-label">Glemt adgangskode</p>
          <h1 className="mt-2 font-display text-4xl tracking-wide sm:text-5xl">Ny kode</h1>
          <p className="mt-2 text-sm text-line/55">
            Vi sender ikke mail. Bed en administrator om en nulstillingskode, og
            vælg så en ny adgangskode her.
          </p>

          <Field label="Brugernavn" className="mt-8 text-left">
            <input
              type="text"
              required
              autoComplete="username"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={fieldClass()}
            />
          </Field>

          <Field label="Nulstillingskode" className="mt-4 text-left">
            <input
              type="text"
              required
              autoComplete="one-time-code"
              spellCheck={false}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className={fieldClass("font-mono tracking-wider")}
            />
          </Field>

          <Field label="Ny adgangskode" className="mt-4 text-left">
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass()}
            />
          </Field>

          <Field label="Gentag adgangskode" className="mt-4 text-left">
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className={fieldClass()}
            />
          </Field>

          {error ? (
            <p className="mt-4 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={submitting} block className="mt-8 py-3">
            {submitting ? "Gemmer…" : "Gem ny adgangskode"}
          </Button>

          <p className="mt-6 text-center text-sm text-line/60">
            <Link to="/login" className="font-semibold text-ball hover:underline">
              Tilbage til log ind
            </Link>
          </p>
          </Card>
        </form>
      </Page>
    </SiteShell>
  );
}
