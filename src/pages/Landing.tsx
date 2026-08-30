import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SiteShell } from "../components/SiteShell";

export function Landing() {
  const { user } = useAuth();

  return (
    <SiteShell>
      <main className="flex min-h-[calc(100vh-5.5rem)] flex-col items-center justify-center px-6 pb-16 text-center">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-ball">
          Lukket padelklub
        </p>
        <h1 className="font-display text-[clamp(4.2rem,16vw,10rem)] leading-[0.85] tracking-[0.04em]">
          Padel By Ramm
        </h1>
        <p className="mt-6 max-w-lg text-base text-line/75 sm:text-lg">
          Velkommen til den lokale padel-liga. Log ind, hvis du allerede er
          medlem, eller opret en konto med en invitationskode.
        </p>

        {user ? (
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <p className="rounded-full border border-ball/30 bg-ball/10 px-5 py-3 text-sm font-medium text-ball">
              Du er inde.
            </p>
            <Link
              to="/kampe"
              className="rounded-full bg-ball px-8 py-3 text-sm font-semibold tracking-wide text-court transition hover:bg-line"
            >
              Kampe
            </Link>
            <Link
              to="/profil"
              className="rounded-full border border-line/25 px-8 py-3 text-sm font-semibold tracking-wide transition hover:border-ball hover:text-ball"
            >
              Din profil
            </Link>
          </div>
        ) : (
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/login"
              className="rounded-full border border-line/25 px-8 py-3 text-sm font-semibold tracking-wide transition hover:border-ball hover:text-ball"
            >
              Log ind
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-ball px-8 py-3 text-sm font-semibold tracking-wide text-court transition hover:bg-line"
            >
              Opret konto
            </Link>
          </div>
        )}
      </main>
    </SiteShell>
  );
}
