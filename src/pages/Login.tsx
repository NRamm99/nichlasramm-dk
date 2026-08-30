import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import { SiteShell } from "../components/SiteShell";

export function Login() {
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const passwordReset = Boolean(
    (location.state as { passwordReset?: boolean } | null)?.passwordReset,
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signIn(username, password);
    setSubmitting(false);

    if (result.error) {
      setError(danishAuthError(result.error));
      return;
    }

    navigate("/", { replace: true });
  }

  return (
    <SiteShell>
      <main className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center px-6 pb-16">
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="w-full max-w-md rounded-3xl border border-line/10 bg-court-mid/80 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
            Velkommen tilbage
          </p>
          <h1 className="mt-2 font-display text-5xl tracking-wide">Log ind</h1>
          <p className="mt-2 text-sm text-line/65">
            Log ind med dit brugernavn.
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
            Adgangskode
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 text-line outline-none transition focus:border-ball"
            />
          </label>

          {passwordReset ? (
            <p className="mt-4 text-sm text-ball" role="status">
              Adgangskoden er opdateret. Log ind med den nye kode.
            </p>
          ) : null}

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
            {submitting ? "Logger ind…" : "Log ind"}
          </button>

          <p className="mt-6 text-center text-sm text-line/60">
            <Link
              to="/glemt-adgangskode"
              className="font-semibold text-ball hover:underline"
            >
              Glemt adgangskode?
            </Link>
          </p>

          <p className="mt-3 text-center text-sm text-line/60">
            Ny i klubben?{" "}
            <Link to="/register" className="font-semibold text-ball hover:underline">
              Opret konto
            </Link>
          </p>
        </form>
      </main>
    </SiteShell>
  );
}
