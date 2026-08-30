import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type SiteShellProps = {
  children: ReactNode;
};

export function SiteShell({ children }: SiteShellProps) {
  const { user, loading, isAdmin, username, signOut } = useAuth();

  return (
    <div className="relative min-h-screen overflow-hidden bg-court text-line">
      <div className="pointer-events-none absolute inset-0 court-grid opacity-70" />
      <div className="pointer-events-none absolute inset-0 court-lines" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-ball/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-8rem] right-[-6rem] h-[22rem] w-[22rem] rounded-full bg-glass/10 blur-3xl" />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link
          to="/"
          className="font-display text-2xl tracking-[0.18em] text-line"
        >
          Padel By Ramm
        </Link>

        <nav className="flex items-center gap-3">
          {loading ? (
            <span className="text-sm text-line/60">Indlæser…</span>
          ) : user ? (
            <>
              <Link
                to="/liga"
                className="rounded-full px-4 py-2 text-sm font-semibold text-line/80 transition hover:text-ball"
              >
                Liga
              </Link>
              <Link
                to="/kampe"
                className="rounded-full px-4 py-2 text-sm font-semibold text-line/80 transition hover:text-ball"
              >
                Kampe
              </Link>
              {isAdmin ? (
                <Link
                  to="/admin"
                  className="rounded-full px-4 py-2 text-sm font-semibold text-line/80 transition hover:text-ball"
                >
                  Invitationer
                </Link>
              ) : null}
              <Link
                to="/profil"
                className="hidden max-w-48 truncate text-sm text-line/70 hover:text-ball sm:inline"
              >
                {username}
              </Link>
              <Link
                to="/profil"
                className="rounded-full px-4 py-2 text-sm font-semibold text-line/80 transition hover:text-ball sm:hidden"
              >
                Profil
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-full border border-line/20 px-4 py-2 text-sm font-semibold text-line transition hover:border-ball hover:text-ball"
              >
                Log ud
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-full px-4 py-2 text-sm font-semibold text-line/80 transition hover:text-ball"
              >
                Log ind
              </Link>
              <Link
                to="/register"
                className="rounded-full bg-ball px-4 py-2 text-sm font-semibold text-court transition hover:bg-line"
              >
                Opret konto
              </Link>
            </>
          )}
        </nav>
      </header>

      <div className="relative z-10">{children}</div>
    </div>
  );
}
