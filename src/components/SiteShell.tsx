import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type SiteShellProps = {
  children: ReactNode;
};

export function SiteShell({ children }: SiteShellProps) {
  const { user, loading, signOut } = useAuth();

  return (
    <div className="relative min-h-screen overflow-x-clip bg-court text-line">
      <div className="pointer-events-none absolute inset-0 overflow-hidden contain-paint">
        <div className="absolute inset-0 court-grid opacity-70" />
        <div className="absolute inset-0 court-lines" />
        <div className="absolute -top-24 left-1/2 h-[28rem] w-[28rem] max-w-none -translate-x-1/2 rounded-full bg-ball/15 blur-3xl" />
        <div className="absolute bottom-[-8rem] right-[-6rem] h-[22rem] w-[22rem] max-w-none rounded-full bg-glass/10 blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-2 px-4 py-5 sm:gap-3 sm:px-10">
        <Link
          to="/"
          className="min-w-0 truncate font-display text-xl tracking-[0.12em] text-line sm:text-2xl sm:tracking-[0.18em]"
        >
          Padel By Ramm
        </Link>

        <nav className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {loading ? (
            <span className="text-sm text-line/60">Indlæser…</span>
          ) : user ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-full border border-line/20 px-3 py-2 text-xs font-semibold text-line transition hover:border-ball hover:text-ball sm:px-4 sm:text-sm"
            >
              Log ud
            </button>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-full px-3 py-2 text-xs font-semibold text-line/80 transition hover:text-ball sm:px-4 sm:text-sm"
              >
                Log ind
              </Link>
              <Link
                to="/register"
                className="rounded-full bg-ball px-3 py-2 text-xs font-semibold text-court transition hover:bg-line sm:px-4 sm:text-sm"
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
