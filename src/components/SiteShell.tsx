import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChatBubbleIcon } from "./ChatBubbleIcon";
import { NewsDialog } from "./NewsDialog";
import { Button } from "./ui/Button";
import { Skeleton } from "./ui/Skeleton";
import { useAuth } from "../context/AuthContext";
import {
  fetchUnreadNotificationCount,
  onUnreadNotificationsChanged,
} from "../lib/matchmaker";
import { fetchUnreadDirectCount, onUnreadMessagesChanged } from "../lib/messages";
import {
  fetchPendingClubNews,
  markClubNewsShown,
  onClubNewsChanged,
  type PendingClubNews,
} from "../lib/news";

type SiteShellProps = {
  children: ReactNode;
  fill?: boolean;
};

export function SiteShell({ children, fill }: SiteShellProps) {
  const { user, loading, isAdmin, canAdmin, setAdminView, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const showTabs = Boolean(user) && !fill;
  const showNav = Boolean(user);
  const [unread, setUnread] = useState(0);
  const [unreadNews, setUnreadNews] = useState(0);
  const [clubNews, setClubNews] = useState<PendingClubNews | null>(null);

  function viewAsMember() {
    setAdminView(false);
    if (location.pathname.startsWith("/admin")) {
      navigate("/");
    }
  }

  function viewAsAdmin() {
    setAdminView(true);
  }

  useEffect(() => {
    if (!user) {
      setUnread(0);
      setUnreadNews(0);
      setClubNews(null);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const [messages, news] = await Promise.all([
          fetchUnreadDirectCount(),
          fetchUnreadNotificationCount(),
        ]);
        if (!cancelled) {
          setUnread(messages);
          setUnreadNews(news);
        }
      } catch {
        if (!cancelled) {
          setUnread(0);
          setUnreadNews(0);
        }
      }
    }

    async function loadClubNews() {
      try {
        const pending = await fetchPendingClubNews();
        if (!cancelled) setClubNews(pending);
      } catch {
        if (!cancelled) setClubNews(null);
      }
    }

    void load();
    void loadClubNews();

    function onVisible() {
      if (document.visibilityState === "visible") {
        void load();
        void loadClubNews();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    const stopUnread = onUnreadMessagesChanged(() => void load());
    const stopNews = onUnreadNotificationsChanged(() => void load());
    const stopClubNews = onClubNewsChanged(() => void loadClubNews());
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      stopUnread();
      stopNews();
      stopClubNews();
    };
  }, [user]);

  useEffect(() => {
    if (!clubNews) return;
    void markClubNewsShown(clubNews.id).catch(() => {
      /* Keep the dialog even if the impression fails. */
    });
  }, [clubNews?.id]);

  return (
    <div
      className={`relative overflow-x-clip bg-court text-line ${
        fill
          ? "flex h-dvh max-h-dvh flex-col lg:flex-row"
          : `min-h-screen ${showNav ? "lg:flex" : ""}`
      } ${showNav ? "has-desktop-nav" : ""}`}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden contain-paint lg:hidden">
        <div className="absolute inset-0 court-grid" />
      </div>

      {showNav ? (
        <SideNav
          unread={unread}
          unreadNews={unreadNews}
          isAdmin={isAdmin}
          canAdmin={canAdmin}
          onViewAsMember={viewAsMember}
          onViewAsAdmin={viewAsAdmin}
          onSignOut={() => void signOut()}
        />
      ) : null}

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          className={`flex shrink-0 items-center justify-between gap-2 px-4 py-5 sm:gap-3 sm:px-10 ${
            showNav ? "lg:hidden" : ""
          }`}
        >
          <Link
            to="/"
            className="min-w-0 truncate font-display text-xl tracking-[0.12em] text-line sm:text-2xl sm:tracking-[0.18em]"
          >
            Padel By Ramm
          </Link>

          <nav className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            {loading ? (
              <Skeleton className="h-9 w-20 rounded-full" />
            ) : user ? (
              <>
                {canAdmin && isAdmin ? (
                  <button
                    type="button"
                    onClick={viewAsMember}
                    className="rounded-full border border-line/20 px-3 py-2 text-xs font-semibold text-line/70 hover:border-ball hover:text-ball sm:px-4 sm:text-sm"
                  >
                    Se som medlem
                  </button>
                ) : null}
                <Button
                  variant="secondary"
                  className="px-3 py-2 text-xs sm:px-4 sm:text-sm"
                  onClick={() => void signOut()}
                >
                  Log ud
                </Button>
              </>
            ) : null}
          </nav>
        </header>

        <div
          className={`relative z-10 ${fill ? "flex min-h-0 flex-1 flex-col" : ""} ${
            showTabs ? "pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0" : ""
          }`}
        >
          {canAdmin && !isAdmin ? (
            <div className="flex items-center justify-between gap-3 border-b border-ball/25 bg-ball/10 px-4 py-2.5 sm:px-10 lg:px-6">
              <p className="text-xs font-semibold text-ball sm:text-sm">
                Du ser klubben som medlem
              </p>
              <button
                type="button"
                onClick={viewAsAdmin}
                className="shrink-0 rounded-full bg-ball px-3 py-1.5 text-xs font-semibold text-court"
              >
                Admin-visning
              </button>
            </div>
          ) : null}
          {children}
        </div>

        {showTabs ? <TabBar unread={unread} /> : null}
      </div>
      {clubNews ? (
        <NewsDialog
          news={clubNews}
          onAcked={() => {
            void fetchPendingClubNews()
              .then(setClubNews)
              .catch(() => setClubNews(null));
          }}
        />
      ) : null}
    </div>
  );
}

function SideNav({
  unread,
  unreadNews,
  isAdmin,
  canAdmin,
  onViewAsMember,
  onViewAsAdmin,
  onSignOut,
}: {
  unread: number;
  unreadNews: number;
  isAdmin: boolean;
  canAdmin: boolean;
  onViewAsMember: () => void;
  onViewAsAdmin: () => void;
  onSignOut: () => void;
}) {
  return (
    <aside className="relative z-20 hidden w-56 shrink-0 flex-col border-r border-line/10 bg-court lg:sticky lg:top-0 lg:flex lg:h-dvh xl:w-60">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 court-grid opacity-50" />
        <Link
          to="/"
          className="relative block px-5 py-5 font-display text-xl tracking-[0.14em] text-line"
        >
          Padel By Ramm
        </Link>
      </div>
      <nav
        aria-label="Hovednavigation"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3"
      >
        <div className="flex flex-col gap-0.5">
          <SideItem to="/" end label="Hjem" icon={<HomeIcon />} />
          <SideItem to="/kampe" label="Kampe" icon={<CalendarIcon />} />
          <SideItem to="/matchmaker" label="Find kamp" icon={<SearchIcon />} />
          <SideItem to="/liga" label="Liga" icon={<TrophyIcon />} />
        </div>
        <div className="flex flex-col gap-0.5">
          <SideItem
            to="/beskeder"
            label="Beskeder"
            icon={<ChatBubbleIcon className="h-5 w-5" />}
            badge={unread}
          />
          <SideItem
            to="/nyt"
            label="Nyt"
            icon={<BellIcon />}
            badge={unreadNews}
          />
          <SideItem to="/medlemmer" label="Medlemmer" icon={<MembersIcon />} />
          <SideItem to="/profil" end label="Profil" icon={<ProfileIcon />} />
          {isAdmin ? (
            <SideItem
              to="/admin"
              label="Administration"
              icon={<AdminIcon />}
            />
          ) : null}
        </div>
      </nav>
      <div className="mt-auto shrink-0 border-t border-line/10 px-3 py-4">
        {canAdmin ? (
          <button
            type="button"
            onClick={isAdmin ? onViewAsMember : onViewAsAdmin}
            className="mb-2 w-full rounded-full border border-line/20 px-3 py-2 text-sm font-semibold text-line/70 hover:border-ball hover:text-ball"
          >
            {isAdmin ? "Se som medlem" : "Admin-visning"}
          </button>
        ) : null}
        <Button
          variant="secondary"
          block
          className="px-3 py-2 text-sm"
          onClick={onSignOut}
        >
          Log ud
        </Button>
      </div>
    </aside>
  );
}

function TabBar({ unread }: { unread: number }) {
  return (
    <nav
      aria-label="Hovednavigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line/10 bg-court/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
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

function SideItem({
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
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold no-underline transition ${
          isActive
            ? "bg-ball/15 text-ball"
            : "text-line/55 hover:bg-line/[0.04] hover:text-line"
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

function iconClass() {
  return "h-5 w-5";
}

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={iconClass()}
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
      className={iconClass()}
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

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={iconClass()}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16.5 20 20.5" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={iconClass()}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 5h10v3.5a5 5 0 0 1-10 0V5Z" />
      <path d="M7 7H5a2.5 2.5 0 0 0 2.5 2.5" />
      <path d="M17 7h2a2.5 2.5 0 0 1-2.5 2.5" />
      <path d="M12 13.5V17" />
      <path d="M8.5 19h7" />
    </svg>
  );
}

function MembersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={iconClass()}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M20.5 19a4.5 4.5 0 0 0-6-4.2" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={iconClass()}
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

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={iconClass()}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 11H3c0-4 3-4 3-11Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={iconClass()}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  );
}
