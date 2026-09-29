import { useSyncExternalStore } from "react";
import { isOnline, subscribeToConnectivity } from "./connectivity-store";

/** true quando há conexão (navegador online e sem falha de rede recente). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeToConnectivity, isOnline, () => true);
}
