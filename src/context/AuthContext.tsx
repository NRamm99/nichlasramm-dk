import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { syncPushSubscription } from "../lib/push";
import {
  isValidUsername,
  normalizeUsername,
  usernameToAuthEmail,
} from "../lib/username";

type SignUpDetails = {
  firstName: string;
  lastName: string;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  username: string | null;
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  async function loadProfile(userId: string | undefined) {
    if (!userId) {
      setIsAdmin(false);
      setUsername(null);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("is_admin, banned_at, username")
      .eq("id", userId)
      .maybeSingle();

    if (data?.banned_at) {
      setIsAdmin(false);
      setUsername(null);
      await supabase.auth.signOut();
      return;
    }

    setIsAdmin(Boolean(data?.is_admin));
    setUsername(data?.username ?? null);
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
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession?.user.id);
      if (nextSession?.user) {
        void syncPushSubscription().catch(() => {});
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      isAdmin,
      username,
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
        return { error: error?.message ?? null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
      async refreshProfile() {
        await loadProfile(session?.user.id);
      },
    }),
    [isAdmin, loading, session, username],
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
