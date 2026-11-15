import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bioimpedanceConsentQueryKey,
  getBioimpedanceConsent,
  setBioimpedanceConsent,
} from "./api";

/** Consulta e muda o consentimento de bioimpedância do cliente (D-042). */
export function useBioimpedanceConsent(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: bioimpedanceConsentQueryKey,
    queryFn: getBioimpedanceConsent,
    enabled,
  });
  const mutation = useMutation({
    mutationFn: setBioimpedanceConsent,
    onSuccess: (response) => {
      queryClient.setQueryData(bioimpedanceConsentQueryKey, response);
    },
  });
  return { query, mutation };
}
