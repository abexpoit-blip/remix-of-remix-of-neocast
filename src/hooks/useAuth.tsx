import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { markSessionStart, clearSessionStart } from "@/lib/session";


export interface AppUser {
  id: string;
  email: string;
  username: string;
  role: string;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  balance: number;
  role: string;
  is_seller: boolean;
  banned: boolean;
}

interface AuthCtx {
  user: AppUser | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const loadedForUid = useRef<string | null>(null);

  const loadProfile = useCallback(async (uid: string | null, email: string | null) => {
    if (!uid) {
      setUser(null);
      setProfile(null);
      loadedForUid.current = null;
      setProfileError(null);
      setLoading(false);
      return;
    }
    if (loadedForUid.current === uid) return;
    loadedForUid.current = uid;

    setLoading(true);
    setProfileError(null);
    try {
      const [{ data: p, error: pErr }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, username, email, avatar_url, balance, blocked").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      if (pErr) throw pErr;

      const roleList = (roles ?? []).map((r) => r.role as string);
      const role = roleList.includes("superadmin")
        ? "superadmin"
        : roleList.includes("admin")
          ? "admin"
          : roleList.includes("seller")
            ? "seller"
            : "buyer";
      const username = p?.username ?? (email ? email.split("@")[0] : "user");

      setUser({ id: uid, email: p?.email ?? email ?? "", username, role });
      setProfile({
        id: uid,
        username,
        display_name: username,
        avatar_url: p?.avatar_url ?? null,
        balance: Number(p?.balance ?? 0),
        role,
        is_seller: role === "seller" || role === "admin" || role === "superadmin",
        banned: Boolean(p?.blocked),
      });
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Failed to load profile");
      setProfile(null);
      loadedForUid.current = null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      const mail = session?.user?.email ?? null;
      if (_event === "SIGNED_IN") markSessionStart();
      if (_event === "SIGNED_OUT") clearSessionStart();
      setTimeout(() => { void loadProfile(uid, mail); }, 0);
    });


    supabase.auth.getSession().then(({ data }) => {
      void loadProfile(data.session?.user?.id ?? null, data.session?.user?.email ?? null);
    });

    return () => { sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const refresh = async () => {
    loadedForUid.current = null;
    const { data } = await supabase.auth.getSession();
    await loadProfile(data.session?.user?.id ?? null, data.session?.user?.email ?? null);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    loadedForUid.current = null;
  };

  return (
    <Ctx.Provider value={{ user, profile, loading, profileError, refresh, signOut }}>
      {children}
    </Ctx.Provider>
  );
};

/** Any admin panel access (admin or super admin). */
export const isAdminRole = (role?: string | null) => role === "admin" || role === "superadmin";
/** Full access: exports, role management, gateway keys. */
export const isSuperAdminRole = (role?: string | null) => role === "superadmin";

export const useAuth = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
