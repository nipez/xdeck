import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { SessionUser, UsageStatus, XAccount } from "@shared/types";
import { api } from "./api";

interface AuthState {
  user: SessionUser | null;
  usage: UsageStatus | null;
  accounts: XAccount[];
  demoMode: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [accounts, setAccounts] = useState<XAccount[]>([]);
  const [demoMode, setDemoMode] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await api.me();
    setUser(data.user);
    setUsage(data.usage ?? null);
    setAccounts(data.accounts ?? []);
    setDemoMode(!!data.demoMode);
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setUsage(null);
    setAccounts([]);
  }, []);

  return (
    <AuthCtx.Provider
      value={{ user, usage, accounts, demoMode, loading, refresh, logout }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
