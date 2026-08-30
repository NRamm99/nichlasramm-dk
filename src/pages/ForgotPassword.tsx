import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { danishAuthError, normalizeInviteCode } from "../lib/authErrors";
import { isValidUsername, normalizeUsername } from "../lib/username";
import { supabase } from "../lib/supabase";
import { SiteShell } from "../components/SiteShell";

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
      <main className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center px-6 pb-16">
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="w-full max-w-md rounded-3xl border border-line/10 bg-court-mid/80 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
            Glemt adgangskode
          </p>
          <h1 className="mt-2 font-display text-5xl tracking-wide">Ny kode</h1>
          <p className="mt-2 text-sm text-line/65">
            Vi sender ikke mail. Bed en administrator om en nulstillingskode, og
            vælg så en ny adgangskode her.
          </p>

          <label className="mt-8 block text-left text-sm font-medium text-line/80">
            Brugernavn
            <input
              type="text"
              required
              autoComplete="username"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 text-line outline-none transition focus:border-ball"
            />
          </label>

          <label className="mt-4 block text-left text-sm font-medium text-line/80">
            Nulstillingskode
            <input
              type="text"
              required
              autoComplete="one-time-code"
              spellCheck={false}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 font-mono tracking-wider text-line outline-none transition focus:border-ball"
            />
          </label>

          <label className="mt-4 block text-left text-sm font-medium text-line/80">
            Ny adgangskode
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 text-line outline-none transition focus:border-ball"
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
              className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 text-line outline-none transition focus:border-ball"
            />
          </label>

          {error ? (
            <p className="mt-4 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-8 w-full rounded-full bg-ball py-3 text-sm font-semibold text-court transition hover:bg-line disabled:opacity-60"
          >
            {submitting ? "Gemmer…" : "Gem ny adgangskode"}
          </button>

          <p className="mt-6 text-center text-sm text-line/60">
            <Link to="/login" className="font-semibold text-ball hover:underline">
              Tilbage til log ind
            </Link>
          </p>
        </form>
      </main>
    </SiteShell>
  );
}
