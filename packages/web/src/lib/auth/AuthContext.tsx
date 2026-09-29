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
import { isOnline, subscribeToConnectivity } from "../connectivity/connectivity-store";
import * as authApi from "./api";

interface AuthContextValue {
  user: CurrentUser | null;
  isAuthenticated: boolean;
  /** true enquanto a tentativa de restaurar a sessão (via /auth/refresh) no carregamento da página ainda não terminou. */
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  /** Atualiza na sessão os dados de identidade que a pessoa editou (nome e e-mail), sem novo login. */
  updateIdentity: (identity: Pick<CurrentUser, "fullName" | "email">) => void;
  can: (module: ModuleName, action: PermissionActionName) => boolean;
}

/** Quantas vezes seguidas a restauração repete de imediato quando a conexão voltou durante a requisição. */
const MAX_RECONNECT_RETRIES = 3;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  // Se o usuário logar/deslogar explicitamente antes da restauração do mount
  // resolver, o resultado tardio dela não deve sobrescrever essa ação.
  const hasExplicitAuthActionRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let stopWaitingForConnection = () => {};

    function restore(attempt = 0) {
      // A conexão pode voltar DURANTE o refresh (o evento "online" chega antes de a
      // requisição em andamento falhar): sem essa marca a retomada esperaria um
      // evento que já passou.
      let reconnectedDuringRequest = false;
      const stopWatching = subscribeToConnectivity(() => {
        if (isOnline()) reconnectedDuringRequest = true;
      });
      void authApi.refreshSessionOutcome().then((outcome) => {
        stopWatching();
        if (cancelled) return;
        if (outcome.status === "transient") {
          // Não dá para saber se a sessão vale (sem rede, 429, 5xx, erro de proxy): a casca
          // abre (login) sem encerrar nada e a restauração é retomada sozinha.
          if (outcome.reason === "network" && reconnectedDuringRequest && attempt < MAX_RECONNECT_RETRIES) {
            restore(attempt + 1);
            return;
          }
          stopWaitingForConnection = subscribeToConnectivity(() => {
            if (!isOnline()) return;
            stopWaitingForConnection();
            restore();
          });
        } else if (!hasExplicitAuthActionRef.current) {
          setUser(outcome.status === "ok" ? outcome.user : null);
        }
        setIsInitializing(false);
      });
    }
    restore();

    return () => {
      cancelled = true;
      stopWaitingForConnection();
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

  const updateIdentity = useCallback((identity: Pick<CurrentUser, "fullName" | "email">) => {
    setUser((current) => (current ? { ...current, ...identity } : current));
  }, []);

  const can = useCallback(
    (module: ModuleName, action: PermissionActionName): boolean => {
      const entry = user?.permissions.find((permission) => permission.module === module);
      return entry?.actions.includes(action) ?? false;
    },
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isInitializing,
      login,
      logout,
      updateIdentity,
      can,
    }),
    [user, isInitializing, login, logout, updateIdentity, can],
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
