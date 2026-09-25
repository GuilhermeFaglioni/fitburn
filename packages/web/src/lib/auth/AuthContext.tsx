import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CurrentUser, ModuleName, PermissionActionName } from "@fitburn/contracts";
import * as authApi from "./api";

interface AuthContextValue {
  user: CurrentUser | null;
  isAuthenticated: boolean;
  /** true enquanto a tentativa de restaurar a sessão (via /auth/refresh) no carregamento da página ainda não terminou. */
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  can: (module: ModuleName, action: PermissionActionName) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  // Se o usuário logar/deslogar explicitamente antes da restauração do mount
  // resolver, o resultado tardio dela não deve sobrescrever essa ação.
  const hasExplicitAuthActionRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    authApi.refreshSession().then((restoredUser) => {
      if (cancelled) return;
      if (!hasExplicitAuthActionRef.current) {
        setUser(restoredUser);
      }
      setIsInitializing(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    hasExplicitAuthActionRef.current = true;
    const loggedInUser = await authApi.login(email, password);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    hasExplicitAuthActionRef.current = true;
    await authApi.logout();
    setUser(null);
  }, []);

  const can = useCallback(
    (module: ModuleName, action: PermissionActionName): boolean => {
      const entry = user?.permissions.find((permission) => permission.module === module);
      return entry?.actions.includes(action) ?? false;
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, isInitializing, login, logout, can }),
    [user, isInitializing, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}
