import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction, PermissionScope, type GoalDetail } from "@fitburn/contracts";
import { errorMessage } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import {
  cancelGoal,
  completeGoal,
  createGoal,
  listGoalClients,
  listGoals,
  updateGoal,
} from "../lib/goals/api";
import { GoalCard } from "./goals/GoalCard";
import { GoalForm, type GoalFormValues } from "./goals/GoalForm";
import { StudentList } from "./goals/StudentList";
import { EmptyState, ErrorState, Feedback, LoadingState } from "../components/states";

/**
 * Metas individuais (MetasAdmin.dc.html): à esquerda os alunos do professor
 * (o escopo "clientes atribuídos"), à direita as metas do aluno escolhido e o
 * formulário de nova meta. O artboard tem "valor alvo" e barra de progresso,
 * que dependem de dados que a API ainda não tem (a meta é concluída à mão pelo professor):
 * ficam de fora até o backend trazer valor alvo e progresso.
 */
export function GoalsPage() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [editing, setEditing] = useState<GoalDetail | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const clientsQuery = useQuery({ queryKey: ["goal-clients"], queryFn: listGoalClients });
  const goalsQuery = useQuery({
    queryKey: ["goals", clientId],
    queryFn: () => listGoals(clientId),
    enabled: clientId !== "",
  });

  /** Uma mutação da tela: zera o aviso ao começar, recarrega as metas e mostra o motivo se falhar. */
  function useGoalMutation<Variables>(
    mutationFn: (variables: Variables) => Promise<unknown>,
    fallbackMessage: string,
    onDone?: () => void,
  ) {
    return useMutation({
      mutationFn,
      onMutate: () => setFailure(null),
      onSuccess: () => {
        onDone?.();
        return queryClient.invalidateQueries({ queryKey: ["goals"] });
      },
      onError: (error) => setFailure(errorMessage(error, fallbackMessage)),
    });
  }

  const createMutation = useGoalMutation(createGoal, "Não foi possível criar a meta.");
  const updateMutation = useGoalMutation(
    ({ id, values }: { id: string; values: GoalFormValues }) =>
      updateGoal(id, {
        title: values.title,
        description: values.description || null,
        dueDate: values.dueDate || null,
      }),
    "Não foi possível salvar a meta.",
    () => setEditing(null),
  );
  const completeMutation = useGoalMutation(completeGoal, "Não foi possível concluir a meta.");
  const cancelMutation = useGoalMutation(cancelGoal, "Não foi possível cancelar a meta.");

  const clients = clientsQuery.data ?? [];
  const selected = clients.find((item) => item.id === clientId);
  const goals = goalsQuery.data ?? [];
  const busy = completeMutation.isPending || cancelMutation.isPending;

  const canCreate = can(Module.GAMIFICACAO, PermissionAction.CREATE);
  const canEdit = can(Module.GAMIFICACAO, PermissionAction.EDIT);
  const allStudents =
    user?.permissions.find((permission) => permission.module === Module.GAMIFICACAO)?.scope ===
    PermissionScope.ALL;

  function selectClient(id: string) {
    setClientId(id);
    setEditing(null);
    setFailure(null);
  }

  return (
    <div className="fb-goals">
      <StudentList
        students={clients}
        selectedId={clientId}
        allStudents={allStudents}
        onSelect={selectClient}
      />

      <div className="fb-goals__main">
        {clientsQuery.isLoading && <LoadingState />}
        {clientsQuery.isError && (
          <ErrorState
            message="Não foi possível carregar os alunos."
            onRetry={() => void clientsQuery.refetch()}
          />
        )}
        {clientsQuery.isSuccess && clients.length === 0 && (
          <EmptyState
            message={
              allStudents ? "Nenhum cliente ativo." : "Você ainda não tem alunos vinculados."
            }
          />
        )}
        {clientsQuery.isSuccess && clients.length > 0 && !selected && (
          <>
            <h1 className="fb-goals__title">Metas individuais</h1>
            <p className="fb-note">Selecione um aluno para ver e criar metas.</p>
          </>
        )}

        {selected && (
          <>
            <div className="fb-goals__heading">
              <span className="fb-page-eyebrow">Metas / {selected.fullName}</span>
              <h1 className="fb-goals__title">Metas individuais</h1>
            </div>

            <div className="fb-lock-banner fb-goals__banner" role="note">
              <span>
                A pontuação de gamificação é calculada automaticamente pelo sistema com base na
                frequência e no progresso do cliente. Os pontos{" "}
                <strong>não podem ser editados</strong> nesta tela — aqui você define apenas as
                metas e acompanha o progresso.
              </span>
            </div>

            {failure && <Feedback tone="error">{failure}</Feedback>}
            {goalsQuery.isLoading && <LoadingState />}
            {goalsQuery.isError && (
              <ErrorState
                message="Não foi possível carregar as metas."
                onRetry={() => void goalsQuery.refetch()}
              />
            )}

            <section className="fb-goals__section" aria-labelledby="fb-goals-list">
              <h2 id="fb-goals-list" className="fb-goals__section-title">
                Metas ativas
              </h2>
              {goalsQuery.isSuccess && goals.length === 0 && (
                <EmptyState message="Este aluno ainda não tem metas." />
              )}
              <ul className="fb-goals__list">
                {goals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    canEdit={canEdit}
                    busy={busy}
                    onEdit={() => setEditing(goal)}
                    onComplete={() => completeMutation.mutate(goal.id)}
                    onCancel={() => cancelMutation.mutate(goal.id)}
                  />
                ))}
              </ul>
            </section>

            <GoalForm
              key={editing?.id ?? "new"}
              editing={editing}
              allowed={editing ? canEdit : canCreate}
              pending={createMutation.isPending || updateMutation.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                if (editing) {
                  await updateMutation.mutateAsync({ id: editing.id, values });
                } else {
                  await createMutation.mutateAsync({
                    clientId,
                    title: values.title,
                    ...(values.description ? { description: values.description } : {}),
                    ...(values.dueDate ? { dueDate: values.dueDate } : {}),
                  });
                }
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
