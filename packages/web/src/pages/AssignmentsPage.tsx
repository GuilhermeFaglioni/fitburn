import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction } from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { QueryBlockState } from "../components/QueryBlockState";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { EmptyState } from "../components/ui/States";
import { Table, type TableColumn } from "../components/ui/Table";
import { errorMessage } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { formatInstantDate } from "../lib/agenda/format";
import {
  createAssignment,
  deleteAssignment,
  getAssignmentOptions,
  listAssignments,
} from "../lib/assignments/api";

/**
 * Atribuição de clientes a professores: a administração escolhe um professor,
 * vê os clientes atribuídos a ele e atribui ou remove. Junto dos clientes com
 * reserva nas aulas do professor, essas atribuições formam o escopo "clientes
 * atribuídos". Não há tela na proposta; segue o preview do admin (D-038, #156): título, professor, tabela de
 * atribuições e o cartão "Atribuir cliente".
 */
export function AssignmentsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [teacherId, setTeacherId] = useState("");
  const [clientId, setClientId] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const optionsQuery = useQuery({
    queryKey: ["assignment-options"],
    queryFn: getAssignmentOptions,
  });
  const assignmentsQuery = useQuery({
    queryKey: ["assignments", teacherId],
    queryFn: () => listAssignments(teacherId),
    enabled: teacherId !== "",
  });

  function refresh() {
    return queryClient.invalidateQueries({ queryKey: ["assignments"] });
  }

  const createMutation = useMutation({
    mutationFn: createAssignment,
    onMutate: () => setFailure(null),
    onSuccess: () => {
      setClientId("");
      return refresh();
    },
    onError: (error) => setFailure(errorMessage(error, "Não foi possível atribuir o cliente.")),
  });
  const removeMutation = useMutation({
    mutationFn: deleteAssignment,
    onMutate: () => setFailure(null),
    onSuccess: refresh,
    onError: (error) => setFailure(errorMessage(error, "Não foi possível remover a atribuição.")),
  });

  const options = optionsQuery.data;
  const teacher = options?.teachers.find((item) => item.id === teacherId);
  const assignments = assignmentsQuery.data ?? [];
  const assignedClientIds = new Set(assignments.map((item) => item.client.id));
  const availableClients =
    options?.clients.filter((client) => !assignedClientIds.has(client.id)) ?? [];

  const canCreate = can(Module.CLIENTES, PermissionAction.CREATE);
  const canDelete = can(Module.CLIENTES, PermissionAction.DELETE);

  const columns: TableColumn<(typeof assignments)[number]>[] = [
    {
      key: "client",
      header: "Cliente",
      className: "fb-ui-table__name",
      cell: (item) => item.client.fullName,
    },
    {
      key: "email",
      header: "E-mail",
      className: "fb-ui-table__muted",
      cell: (item) => item.client.email,
    },
    {
      key: "since",
      header: "Atribuído em",
      className: "fb-ui-table__muted",
      cell: (item) => formatInstantDate(item.createdAt),
    },
    {
      key: "actions",
      header: "Ações",
      actions: true,
      cell: (item) => (
        <BlockedAction
          allowed={canDelete}
          reason="Você não tem permissão para remover atribuições."
        >
          <Button
            size="sm"
            variant="ghost-danger"
            aria-label={`Remover atribuição de ${item.client.fullName}`}
            disabled={removeMutation.isPending}
            onClick={() => removeMutation.mutate(item.id)}
          >
            Remover
          </Button>
        </BlockedAction>
      ),
    },
  ];

  return (
    <div className="fb-ui-page">
      <PageHeader kicker="Clientes" title="Atribuição de clientes a professores" />

      <p role="note" className="fb-ui-note">
        Um professor acompanha os clientes que reservam as aulas dele e os que forem atribuídos
        aqui.
      </p>

      <QueryBlockState
        query={optionsQuery}
        hasData={options !== undefined}
        loading="Carregando atribuições…"
        error="Não foi possível carregar as atribuições."
      />
      {teacher && (
        <QueryBlockState
          query={assignmentsQuery}
          hasData={assignmentsQuery.data !== undefined}
          loading="Carregando atribuições…"
          error="Não foi possível carregar as atribuições."
        />
      )}
      {failure && <Alert>{failure}</Alert>}

      {options && (
        <>
          <Select
            className="fb-ui-field--narrow"
            label="Professor"
            value={teacherId}
            onChange={(event) => {
              setTeacherId(event.target.value);
              setClientId("");
              setFailure(null);
            }}
          >
            <option value="">Selecione um professor</option>
            {options.teachers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </Select>

          {!teacher && (
            <p className="fb-ui-note">
              Selecione um professor para ver os clientes atribuídos a ele.
            </p>
          )}

          {teacher && assignmentsQuery.isSuccess && assignments.length === 0 && (
            <EmptyState title={`Nenhum cliente atribuído manualmente a ${teacher.fullName}.`} />
          )}

          {teacher && assignments.length > 0 && (
            <Table
              label={`Clientes atribuídos a ${teacher.fullName}`}
              columns={columns}
              rows={assignments}
              rowKey={(item) => item.id}
            />
          )}

          {teacher && (
            <Card className="fb-ui-stack" aria-labelledby="atribuir-cliente">
              <h2 id="atribuir-cliente" className="fb-ui-section-title">
                Atribuir cliente
              </h2>
              <div className="fb-ui-toolbar">
                <Select
                  label="Cliente"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                >
                  <option value="">Selecione um cliente</option>
                  {availableClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.fullName} · {client.email}
                    </option>
                  ))}
                </Select>
                <BlockedAction
                  allowed={canCreate}
                  reason="Você não tem permissão para atribuir clientes."
                >
                  <Button
                    variant="primary"
                    size="sm"
                    busy={createMutation.isPending}
                    disabled={clientId === ""}
                    onClick={() => createMutation.mutate({ teacherId, clientId })}
                  >
                    Atribuir
                  </Button>
                </BlockedAction>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
