import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Module, PermissionAction, PermissionScope, type GoalDetail } from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { HealthDataNotice } from "../components/HealthDataNotice";
import { QueryBlockState } from "../components/QueryBlockState";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/States";
import { useAuth } from "../lib/auth/AuthContext";
import { listGoalClients, listGoals } from "../lib/goals/api";
import { GoalCard, type GoalAction } from "./goals/GoalCard";
import { GoalConfirmDialog } from "./goals/GoalConfirmDialog";
import { GoalForm } from "./goals/GoalForm";
import { StudentList } from "./goals/StudentList";

/** O diálogo aberto: nova meta, edição, ou a confirmação de concluir ou cancelar. */
type OpenDialog =
  | { kind: "create" }
  | { kind: "edit"; goal: GoalDetail }
  | { kind: "complete" | "cancel"; goal: GoalDetail };

/**
 * Metas individuais, em lista + detalhe (D-038, #156): à esquerda os alunos do professor (coluna de `--list-w`; o
 * escopo "clientes atribuídos" é o que a API devolve), à direita as metas do aluno escolhido. Nova meta e edição
 * abrem um diálogo com campos; concluir e cancelar pedem confirmação em diálogo. Não há barra de progresso: a API
 * ainda não tem valor alvo nem progresso (a meta é concluída à mão pelo professor).
 */
export function GoalsPage() {
  const { user, can } = useAuth();
  const listTitleId = useId();
  const listTitleRef = useRef<HTMLHeadingElement>(null);
  const [clientId, setClientId] = useState("");
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  /** Sobe quando uma meta sai da lista de ativas (o botão que abriu o diálogo some): o foco vai ao título da lista. */
  const [refocusList, setRefocusList] = useState(0);

  const clientsQuery = useQuery({ queryKey: ["goal-clients"], queryFn: listGoalClients });
  const goalsQuery = useQuery({
    queryKey: ["goals", clientId],
    queryFn: () => listGoals(clientId),
    enabled: clientId !== "",
  });

  useEffect(() => {
    if (refocusList > 0) listTitleRef.current?.focus();
  }, [refocusList]);

  const clients = clientsQuery.data ?? [];
  const selected = clients.find((item) => item.id === clientId);
  const goals = goalsQuery.data ?? [];

  const canCreate = can(Module.GAMIFICACAO, PermissionAction.CREATE);
  const canEdit = can(Module.GAMIFICACAO, PermissionAction.EDIT);
  const allStudents =
    user?.permissions.find((permission) => permission.module === Module.GAMIFICACAO)?.scope ===
    PermissionScope.ALL;

  function selectClient(id: string) {
    setClientId(id);
    setDialog(null);
  }

  function act(goal: GoalDetail, action: GoalAction) {
    setDialog({ kind: action, goal });
  }

  return (
    <div className="fb-ui-page">
      <PageHeader kicker="Metas" title="Metas individuais" />

      <div className="fb-ui-master">
        <StudentList
          students={clients}
          selectedId={clientId}
          allStudents={allStudents}
          onSelect={selectClient}
        />

        <div className="fb-ui-master__detail">
          <HealthDataNotice />
          <QueryBlockState
            query={clientsQuery}
            hasData={clientsQuery.data !== undefined}
            loading="Carregando alunos…"
            error="Não foi possível carregar os alunos."
          />
          {clientsQuery.isSuccess && clients.length === 0 && (
            <EmptyState
              title={allStudents ? "Nenhum cliente ativo." : "Você ainda não tem alunos vinculados."}
            />
          )}
          {clientsQuery.isSuccess && clients.length > 0 && !selected && (
            <EmptyState title="Selecione um aluno para ver e criar metas." />
          )}

          {selected && (
            <section aria-labelledby={listTitleId} className="fb-ui-goals">
              <p role="note" className="fb-ui-notice">
                A pontuação de gamificação é calculada automaticamente pelo sistema com base na
                frequência e no progresso do cliente. Os pontos{" "}
                <strong>não podem ser editados</strong> nesta tela: aqui você define apenas as metas
                e marca quando são concluídas.
              </p>

              <div className="fb-ui-goals__head">
                <h2 id={listTitleId} ref={listTitleRef} tabIndex={-1} className="fb-ui-goals__title">
                  Metas de {selected.fullName}
                </h2>
                <BlockedAction allowed={canCreate} reason="Você não tem permissão para criar metas.">
                  <Button size="sm" variant="soft" onClick={() => setDialog({ kind: "create" })}>
                    + Nova meta
                  </Button>
                </BlockedAction>
              </div>

              <QueryBlockState
                query={goalsQuery}
                hasData={goalsQuery.data !== undefined}
                loading="Carregando metas…"
                error="Não foi possível carregar as metas."
              />
              {goalsQuery.isSuccess && goals.length === 0 && (
                <EmptyState title="Este aluno ainda não tem metas." />
              )}
              {goals.length > 0 && (
                <ul className="fb-ui-goals__list">
                  {goals.map((goal) => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      canEdit={canEdit}
                      onAction={(action) => act(goal, action)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {dialog?.kind === "create" && (
        <GoalForm clientId={clientId} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "edit" && (
        <GoalForm clientId={clientId} goal={dialog.goal} onClose={() => setDialog(null)} />
      )}
      {(dialog?.kind === "complete" || dialog?.kind === "cancel") && (
        <GoalConfirmDialog
          goal={dialog.goal}
          action={dialog.kind}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            setRefocusList((current) => current + 1);
          }}
        />
      )}
    </div>
  );
}
