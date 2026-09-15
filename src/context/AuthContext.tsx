import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { syncPushSubscription } from "../lib/push";
import { setAppBadgeCount, syncAppBadge } from "../lib/appBadge";
import {
  isValidUsername,
  normalizeUsername,
  usernameToAuthEmail,
} from "../lib/username";

type SignUpDetails = {
  firstName: string;
  lastName: string;
};

const ADMIN_VIEW_KEY = "pbr-admin-view";

function readStoredAdminView() {
  try {
    return localStorage.getItem(ADMIN_VIEW_KEY) !== "0";
  } catch {
    return true;
  }
}

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  canAdmin: boolean;
  setAdminView: (next: boolean) => void;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  signIn: (
    username: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signUp: (
    username: string,
    password: string,
    inviteCode: string,
    details: SignUpDetails,
  ) => Promise<{
    error: string | null;
    userId: string | null;
  }>;
  setOwnAvatar: (url: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [canAdmin, setCanAdmin] = useState(false);
  const [adminView, setAdminViewState] = useState(readStoredAdminView);
  const [username, setUsername] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const setAdminView = useCallback((next: boolean) => {
    setAdminViewState(next);
    try {
      localStorage.setItem(ADMIN_VIEW_KEY, next ? "1" : "0");
    } catch {
      /* Keep the in-memory choice even if storage is blocked. */
    }
  }, []);

  async function loadProfile(userId: string | undefined) {
    if (!userId) {
      setCanAdmin(false);
      setUsername(null);
      setFirstName(null);
      setLastName(null);
      setAvatarUrl(null);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("is_admin, banned_at, username, first_name, last_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();

    if (data?.banned_at) {
      setCanAdmin(false);
      setUsername(null);
      setFirstName(null);
      setLastName(null);
      setAvatarUrl(null);
      await supabase.auth.signOut();
      return;
    }

    setCanAdmin(Boolean(data?.is_admin));
    setUsername(data?.username ?? null);
    setFirstName(data?.first_name ?? null);
    setLastName(data?.last_name ?? null);
    setAvatarUrl(data?.avatar_url ?? null);
  }

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      void loadProfile(data.session?.user.id).finally(() => {
        if (isMounted) setLoading(false);
      });
      if (data.session?.user) {
        void syncPushSubscription().catch(() => {});
        void syncAppBadge();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession?.user.id);
      if (nextSession?.user) {
        void syncPushSubscription().catch(() => {});
        void syncAppBadge();
      } else {
        void setAppBadgeCount(0);
      }
    });

    function onVisibility() {
      if (document.visibilityState === "visible") void syncAppBadge();
    }
    function onPageShow() {
      void syncAppBadge();
    }
    function onWorkerMessage(event: MessageEvent) {
      if (event.data?.type === "APP_BADGE") {
        void setAppBadgeCount(Number(event.data.count) || 0);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, []);

  const isAdmin = canAdmin && adminView;

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      isAdmin,
      canAdmin,
      setAdminView,
      username,
      firstName,
      lastName,
      avatarUrl,
      async signIn(usernameValue, password) {
        const normalized = normalizeUsername(usernameValue);
        if (!isValidUsername(normalized)) {
          return { error: "USERNAME_INVALID" };
        }

        const { error } = await supabase.auth.signInWithPassword({
          email: usernameToAuthEmail(normalized),
          password,
        });
        return { error: error?.message ?? null };
      },
      async signUp(usernameValue, password, inviteCode, details) {
        const normalized = normalizeUsername(usernameValue);
        if (!isValidUsername(normalized)) {
          return { error: "USERNAME_INVALID", userId: null };
        }

        const { data: inviteOk, error: inviteError } = await supabase.rpc(
          "invite_code_available",
          { p_code: inviteCode },
        );

        if (inviteError) {
          return { error: inviteError.message, userId: null };
        }

        if (!inviteOk) {
          return { error: "INVITE_INVALID", userId: null };
        }

        const { data: nameFree, error: nameError } = await supabase.rpc(
          "username_available",
          { p_username: normalized },
        );

        if (nameError) {
          return { error: nameError.message, userId: null };
        }

        if (!nameFree) {
          return { error: "USERNAME_TAKEN", userId: null };
        }

        const { data, error } = await supabase.auth.signUp({
          email: usernameToAuthEmail(normalized),
          password,
          options: {
            data: {
              invite_code: inviteCode,
              first_name: details.firstName,
              last_name: details.lastName,
              username: normalized,
            },
          },
        });
        return {
          error: error?.message ?? null,
          userId: data.user?.id ?? null,
        };
      },
      async setOwnAvatar(url) {
        const { error } = await supabase.rpc("set_own_avatar", { p_url: url });
        if (!error) setAvatarUrl(url);
        return { error: error?.message ?? null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async refreshProfile() {
        await loadProfile(session?.user.id);
      },
    }),
    [
      adminView,
      avatarUrl,
      canAdmin,
      firstName,
      isAdmin,
      lastName,
      loading,
      session,
      setAdminView,
      username,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth skal bruges inden for AuthProvider");
  }
  return context;
}
