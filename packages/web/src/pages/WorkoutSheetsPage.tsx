import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Module,
  PermissionAction,
  PermissionScope,
  WorkoutSheetStatus,
  type WorkoutSheet,
} from "@fitburn/contracts";
import { formatInstantDate } from "../lib/agenda/format";
import { errorMessage } from "../lib/auth/api";
import { useAuth } from "../lib/auth/AuthContext";
import {
  createWorkoutSheet,
  listWorkoutSheetClients,
  listWorkoutSheets,
  updateWorkoutSheet,
} from "../lib/workout-sheets/api";
import { StudentList } from "./goals/StudentList";
import { SheetEditor, type SheetFormValues } from "./workout-sheets/SheetEditor";
import { statusBadge } from "./workout-sheets/status";
import { EmptyState, ErrorState, Feedback, LoadingState } from "../components/states";

const BADGE_CLASS = {
  [WorkoutSheetStatus.ACTIVE]: "fb-badge--active",
  [WorkoutSheetStatus.COMPLETED]: "fb-badge--neutral",
  [WorkoutSheetStatus.ARCHIVED]: "fb-badge--inactive",
} as const;

/**
 * Fichas de treino do professor (FichaTreinoAdmin.dc.html): à esquerda os
 * alunos do escopo, à direita o editor da ficha e as fichas do aluno
 * escolhido. O status da ficha muda no próprio editor.
 */
export function WorkoutSheetsPage() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [editing, setEditing] = useState<WorkoutSheet | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Sobe a cada ficha salva: o editor recomeça em branco. */
  const [formVersion, setFormVersion] = useState(0);

  const clientsQuery = useQuery({
    queryKey: ["workout-sheet-clients"],
    queryFn: listWorkoutSheetClients,
  });
  const sheetsQuery = useQuery({
    queryKey: ["workout-sheets", clientId],
    queryFn: () => listWorkoutSheets(clientId),
    enabled: clientId !== "",
  });

  const mutation = useMutation({
    mutationFn: (values: SheetFormValues) =>
      editing
        ? updateWorkoutSheet(editing.id, {
            title: values.title,
            notes: values.notes || null,
            status: values.status,
            exercises: values.exercises,
          })
        : createWorkoutSheet({
            clientId,
            title: values.title,
            ...(values.notes ? { notes: values.notes } : {}),
            status: values.status,
            exercises: values.exercises,
          }),
    onMutate: () => setFailure(null),
    onSuccess: () => {
      setEditing(null);
      setFormVersion((current) => current + 1);
      return queryClient.invalidateQueries({ queryKey: ["workout-sheets"] });
    },
    onError: (error) => setFailure(errorMessage(error, "Não foi possível salvar a ficha.")),
  });

  const clients = clientsQuery.data ?? [];
  const selected = clients.find((item) => item.id === clientId);
  const sheets = sheetsQuery.data ?? [];

  const canCreate = can(Module.FICHAS_DE_TREINO, PermissionAction.CREATE);
  const canEdit = can(Module.FICHAS_DE_TREINO, PermissionAction.EDIT);
  const allStudents =
    user?.permissions.find((permission) => permission.module === Module.FICHAS_DE_TREINO)?.scope ===
    PermissionScope.ALL;

  function selectClient(id: string) {
    setClientId(id);
    setEditing(null);
    setFailure(null);
  }

  function edit(sheet: WorkoutSheet | null) {
    setEditing(sheet);
    setFailure(null);
  }

  return (
    <div className="fb-sheets">
      <StudentList
        students={clients}
        selectedId={clientId}
        allStudents={allStudents}
        onSelect={selectClient}
      />

      <div className="fb-sheets__main">
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
          <p className="fb-note">Selecione um aluno para ver e montar fichas.</p>
        )}

        {selected && (
          <>
            <div className="fb-sheets__head">
              <div className="fb-sheets__heading">
                <span className="fb-page-eyebrow">Fichas de treino / {selected.fullName}</span>
                <h1 className="fb-sheets__title">
                  {editing ? `Editar ficha — ${editing.title}` : "Nova ficha"}
                </h1>
              </div>
              {editing && (
                <button type="button" className="fb-btn-secondary" onClick={() => edit(null)}>
                  + Nova ficha
                </button>
              )}
            </div>

            {failure && <Feedback tone="error">{failure}</Feedback>}

            <SheetEditor
              key={`${editing?.id ?? "new"}-${formVersion}`}
              editing={editing}
              allowed={editing ? canEdit : canCreate}
              pending={mutation.isPending}
              onCancel={() => edit(null)}
              onSubmit={async (values) => {
                await mutation.mutateAsync(values);
              }}
            />

            <section className="fb-sheets__previous" aria-labelledby="fb-sheets-list">
              <h2 id="fb-sheets-list" className="fb-sheets__section-title">
                Fichas de {selected.fullName}
              </h2>
              {sheetsQuery.isLoading && <LoadingState />}
              {sheetsQuery.isError && (
                <ErrorState
                  message="Não foi possível carregar as fichas."
                  onRetry={() => void sheetsQuery.refetch()}
                />
              )}
              {sheetsQuery.isSuccess && sheets.length === 0 && (
                <EmptyState message="Este aluno ainda não tem fichas." />
              )}
              <ul className="fb-sheets__list" aria-label={`Fichas de ${selected.fullName}`}>
                {sheets.map((sheet) => (
                  <li
                    key={sheet.id}
                    className={`fb-sheets__item${
                      sheet.status === WorkoutSheetStatus.ARCHIVED ? " fb-sheets__item--closed" : ""
                    }`}
                  >
                    <div className="fb-sheets__item-text">
                      <span className="fb-sheets__item-title">{sheet.title}</span>
                      <span className="fb-sheets__item-meta">
                        {sheet.exercises.length}{" "}
                        {sheet.exercises.length === 1 ? "exercício" : "exercícios"} · criada em{" "}
                        {formatInstantDate(sheet.createdAt)}
                      </span>
                    </div>
                    <div className="fb-sheets__item-actions">
                      <span className={`fb-badge ${BADGE_CLASS[sheet.status]}`}>
                        {statusBadge(sheet.status)}
                      </span>
                      <button type="button" className="fb-row-btn" onClick={() => edit(sheet)}>
                        Editar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
