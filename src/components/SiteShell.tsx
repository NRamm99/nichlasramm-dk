import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { ChatBubbleIcon } from "./ChatBubbleIcon";
import { Button } from "./ui/Button";
import { useAuth } from "../context/AuthContext";
import { fetchUnreadDirectCount } from "../lib/messages";

type SiteShellProps = {
  children: ReactNode;
  fill?: boolean;
};

export function SiteShell({ children, fill }: SiteShellProps) {
  const { user, loading, signOut } = useAuth();
  const showTabs = Boolean(user) && !fill;

  return (
    <div
      className={`relative overflow-x-clip bg-court text-line ${
        fill ? "flex h-dvh max-h-dvh flex-col" : "min-h-screen"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden contain-paint">
        <div className="absolute inset-0 court-grid" />
      </div>

      <header className="relative z-10 flex shrink-0 items-center justify-between gap-2 px-4 py-5 sm:gap-3 sm:px-10">
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
            <Button
              variant="secondary"
              className="px-3 py-2 text-xs sm:px-4 sm:text-sm"
              onClick={() => void signOut()}
            >
              Log ud
            </Button>
          ) : null}
        </nav>
      </header>

      <div
        className={`relative z-10 ${fill ? "flex min-h-0 flex-1 flex-col" : ""} ${
          showTabs ? "pb-[calc(4.75rem+env(safe-area-inset-bottom))]" : ""
        }`}
      >
        {children}
      </div>

      {showTabs ? <TabBar /> : null}
    </div>
  );
}

function TabBar() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const count = await fetchUnreadDirectCount();
        if (!cancelled) setUnread(count);
      } catch {
        if (!cancelled) setUnread(0);
      }
    }

    void load();

    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <nav
      aria-label="Hovednavigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line/10 bg-court/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4 px-2 pt-1">
        <TabItem to="/" end label="Hjem" icon={<HomeIcon />} />
        <TabItem to="/kampe" label="Kampe" icon={<CalendarIcon />} />
        <TabItem
          to="/beskeder"
          label="Beskeder"
          icon={<ChatBubbleIcon className="h-5 w-5" />}
          badge={unread}
        />
        <TabItem to="/profil" end label="Profil" icon={<ProfileIcon />} />
      </ul>
    </nav>
  );
}

function TabItem({
  to,
  label,
  icon,
  end,
  badge = 0,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  badge?: number;
}) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          `relative flex flex-col items-center gap-0.5 py-2 text-[0.7rem] font-semibold no-underline ${
            isActive ? "text-ball" : "text-line/45"
          }`
        }
      >
        <span className="relative">
          {icon}
          {badge > 0 ? (
            <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-ball px-0.5 text-[0.55rem] font-bold text-court">
              {badge > 9 ? "9+" : badge}
            </span>
          ) : null}
        </span>
        {label}
      </NavLink>
    </li>
  );
}

function HomeIcon() {
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
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6.5 10.5V20h11V10.5" />
    </svg>
  );
}

function CalendarIcon() {
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
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3.5v3" />
      <path d="M16 3.5v3" />
      <path d="M3.5 10h17" />
    </svg>
  );
}

function ProfileIcon() {
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
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19.5a7 7 0 0 1 14 0" />
    </svg>
  );
}
