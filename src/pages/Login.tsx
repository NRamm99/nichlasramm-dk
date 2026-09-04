import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import { SiteShell } from "../components/SiteShell";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, fieldClass } from "../components/ui/Field";
import { Page } from "../components/ui/Page";

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
      <Page center>
        <form onSubmit={(event) => void handleSubmit(event)} className="w-full max-w-md">
          <Card className="p-6 sm:p-8">
          <p className="ui-label">Velkommen tilbage</p>
          <h1 className="mt-2 font-display text-4xl tracking-wide sm:text-5xl">Log ind</h1>
          <p className="mt-2 text-sm text-line/55">
            Log ind med dit brugernavn.
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

          <Field label="Adgangskode" className="mt-4 text-left">
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass()}
            />
          </Field>

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

          <Button type="submit" disabled={submitting} block className="mt-8 py-3">
            {submitting ? "Logger ind…" : "Log ind"}
          </Button>

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
          </Card>
        </form>
      </Page>
    </SiteShell>
  );
}
