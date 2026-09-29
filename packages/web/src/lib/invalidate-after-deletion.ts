import type { QueryClient } from "@tanstack/react-query";

/**
 * Excluir (anonimizar) uma pessoa muda o que várias telas mostram: ela some das
 * listas de usuários e de clientes, do ranking e das opções de plano,
 * atribuição, fichas, metas e professores, e os números do dashboard mudam.
 * As chaves são prefixos das consultas de cada tela.
 */
const QUERIES_AFFECTED_BY_DELETION = [
  "users",
  "clients",
  "dashboard",
  "gamification",
  "plans",
  "plan-options",
  "assignment-options",
  "assignments",
  "instructors",
  "occurrence-options",
  "goal-clients",
  "goals",
  "workout-sheet-clients",
  "workout-sheets",
  "admin-reservations",
  "client-agenda",
  "attendance-classes",
];

export function invalidateAfterDeletion(queryClient: QueryClient): Promise<unknown> {
  return Promise.all(
    QUERIES_AFFECTED_BY_DELETION.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  );
}
