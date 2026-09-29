import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Module, PermissionAction, utcToGymDateTime } from "@fitburn/contracts";
import { BlockedAction } from "../components/BlockedAction";
import { ApiError } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import { formatLocalDate } from "../lib/agenda/format";
import {
  createAssignment,
  deleteAssignment,
  getAssignmentOptions,
  listAssignments,
} from "../lib/assignments/api";

function failureMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Atribuição de clientes a professores: a administração escolhe um professor,
 * vê os clientes atribuídos a ele e atribui ou remove. Junto dos clientes com
 * reserva nas aulas do professor, essas atribuições formam o escopo "clientes
 * atribuídos". Não há artboard para esta tela no canvas: usa a casca
 * administrativa clara, como as telas de Usuários e de Templates.
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
    onError: (error) => setFailure(failureMessage(error, "Não foi possível atribuir o cliente.")),
  });
  const removeMutation = useMutation({
    mutationFn: deleteAssignment,
    onMutate: () => setFailure(null),
    onSuccess: refresh,
    onError: (error) => setFailure(failureMessage(error, "Não foi possível remover a atribuição.")),
  });

  const options = optionsQuery.data;
  const teacher = options?.teachers.find((item) => item.id === teacherId);
  const assignments = assignmentsQuery.data ?? [];
  const assignedClientIds = new Set(assignments.map((item) => item.client.id));
  const availableClients =
    options?.clients.filter((client) => !assignedClientIds.has(client.id)) ?? [];

  const canCreate = can(Module.CLIENTES, PermissionAction.CREATE);
  const canDelete = can(Module.CLIENTES, PermissionAction.DELETE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="fb-page-eyebrow">Clientes</span>
        <h1 className="fb-page-title">Atribuição de clientes a professores</h1>
      </div>

      <div className="fb-lock-banner" role="note">
        Um professor acompanha os clientes que reservam as aulas dele e os que forem atribuídos
        aqui.
      </div>

      {optionsQuery.isLoading && <p className="fb-note">Carregando…</p>}
      {(optionsQuery.isError || assignmentsQuery.isError) && (
        <p role="alert">Não foi possível carregar as atribuições.</p>
      )}
      {failure && <p role="alert">{failure}</p>}

      {options && (
        <>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "#4a4a4a",
            }}
          >
            Professor
            <select
              className="fb-field"
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
            </select>
          </label>

          {!teacher && (
            <p className="fb-note">Selecione um professor para ver os clientes atribuídos a ele.</p>
          )}

          {teacher && assignmentsQuery.isSuccess && assignments.length === 0 && (
            <p className="fb-note">Nenhum cliente atribuído manualmente a {teacher.fullName}.</p>
          )}

          {teacher && assignments.length > 0 && (
            <div className="fb-table-wrap" style={{ flexGrow: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th className="fb-th">Cliente</th>
                    <th className="fb-th">E-mail</th>
                    <th className="fb-th">Atribuído em</th>
                    <th className="fb-th" style={{ textAlign: "right" }}>
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((item) => (
                    <tr key={item.id}>
                      <td className="fb-td" style={{ fontWeight: 500 }}>
                        {item.client.fullName}
                      </td>
                      <td className="fb-td" style={{ color: "#5a5a5a" }}>
                        {item.client.email}
                      </td>
                      <td className="fb-td" style={{ color: "#5a5a5a" }}>
                        {formatLocalDate(utcToGymDateTime(item.createdAt).date)}
                      </td>
                      <td className="fb-td" style={{ textAlign: "right" }}>
                        <BlockedAction
                          allowed={canDelete}
                          reason="Você não tem permissão para remover atribuições."
                        >
                          <button
                            type="button"
                            className="fb-row-btn fb-row-btn--danger"
                            disabled={removeMutation.isPending}
                            onClick={() => removeMutation.mutate(item.id)}
                          >
                            Remover
                          </button>
                        </BlockedAction>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {teacher && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  color: "#4a4a4a",
                }}
              >
                Cliente
                <select
                  className="fb-field"
                  style={{ minWidth: 260 }}
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                >
                  <option value="">Selecione um cliente</option>
                  {availableClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.fullName} · {client.email}
                    </option>
                  ))}
                </select>
              </label>
              <BlockedAction
                allowed={canCreate}
                reason="Você não tem permissão para atribuir clientes."
              >
                <button
                  type="button"
                  className="fb-btn-primary"
                  disabled={clientId === "" || createMutation.isPending}
                  onClick={() => createMutation.mutate({ teacherId, clientId })}
                >
                  Atribuir
                </button>
              </BlockedAction>
            </div>
          )}
        </>
      )}
    </div>
  );
}
