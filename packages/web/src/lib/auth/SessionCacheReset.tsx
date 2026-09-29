import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";

/**
 * Esvazia o cache de consultas quando a sessão termina (sair, sessão expirada):
 * sem isso, quem entra em seguida na mesma aba vê, até a próxima consulta, os
 * dados da pessoa anterior.
 */
export function SessionCacheReset() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) queryClient.clear();
  }, [user, queryClient]);

  return null;
}
