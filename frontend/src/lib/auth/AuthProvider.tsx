"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { ApiError, getToken, setToken } from "@/lib/api/client";
import { authApi } from "@/lib/api/resources";
import type { User } from "@/lib/api/types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState(false);
  // Distinguishes "haven't checked localStorage yet" from "checked, no
  // token" so route guards don't redirect before hydration ever runs.
  const [hydrated, setHydrated] = useState(false);

  // Tried useSyncExternalStore here to read localStorage without an effect
  // (the textbook fix for this class of bug) — it regressed: a full page
  // load (not client-side nav) still redirected logged-in users to /login,
  // because the route guard's effect in AppLayout runs before
  // useSyncExternalStore's post-hydration resync is visible to it. Verified
  // against a real reload, not just reasoned about. The `hydrated` gate
  // below is load-bearing, not a lint-avoidable pattern.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setHasToken(Boolean(getToken()));
    setHydrated(true);
  }, []);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    enabled: hasToken,
    retry: false,
  });

  useEffect(() => {
    // Stale/invalid token (e.g. expired) — drop it so we don't keep retrying.
    if (meQuery.isError && meQuery.error instanceof ApiError && meQuery.error.status === 401) {
      setToken(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to an invalid-token event, not local UI state
      setHasToken(false);
    }
  }, [meQuery.isError, meQuery.error]);

  async function login(email: string, password: string) {
    const token = await authApi.login(email, password);
    setToken(token.access_token);
    setHasToken(true);
    await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  }

  async function signup(email: string, password: string) {
    await authApi.signup(email, password);
    await login(email, password);
  }

  async function loginAsGuest() {
    const token = await authApi.guest();
    setToken(token.access_token);
    setHasToken(true);
    await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  }

  function logout() {
    setToken(null);
    setHasToken(false);
    queryClient.setQueryData(["auth", "me"], null);
    queryClient.clear();
  }

  const value: AuthContextValue = {
    user: meQuery.data ?? null,
    isLoading: !hydrated || (hasToken && meQuery.isLoading),
    isAuthenticated: Boolean(meQuery.data),
    login,
    signup,
    loginAsGuest,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
