import { useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Module,
  PermissionAction,
  PermissionScope,
  type WorkoutSheet,
} from "@fitburn/contracts";
import { QueryBlockState } from "../components/QueryBlockState";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/States";
import { Table, type TableColumn } from "../components/ui/Table";
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
import { STATUS_TONE, statusBadge } from "./workout-sheets/status";

function exerciseCount(count: number): string {
  return `${count} ${count === 1 ? "exercício" : "exercícios"}`;
}

/**
 * Fichas de treino do professor, em lista + detalhe (D-038, #156): à esquerda os alunos do escopo (coluna de
 * `--list-w`), à direita o editor da ficha e as fichas do aluno escolhido. O status da ficha muda no próprio editor.
 * O escopo é o que a API devolve: o professor só vê e edita as fichas dos alunos dele.
 */
export function WorkoutSheetsPage() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const editorTitleId = useId();
  const listTitleId = useId();
  // A ficha do aluno aberta a partir de uma aula chega com ?cliente=<id>.
  const [searchParams] = useSearchParams();
  const [clientId, setClientId] = useState(() => searchParams.get("cliente") ?? "");
  const [editing, setEditing] = useState<WorkoutSheet | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Sobe a cada ficha salva ou descartada: o editor recomeça em branco. */
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
    setFormVersion((current) => current + 1);
  }

  function edit(sheet: WorkoutSheet | null) {
    setEditing(sheet);
    setFailure(null);
    setFormVersion((current) => current + 1);
  }

  const columns: TableColumn<WorkoutSheet>[] = [
    { key: "title", header: "Título", className: "fb-ui-table__name", cell: (sheet) => sheet.title },
    {
      key: "exercises",
      header: "Exercícios",
      className: "fb-ui-table__muted",
      cell: (sheet) => exerciseCount(sheet.exercises.length),
    },
    {
      key: "created",
      header: "Criada em",
      className: "fb-ui-table__muted",
      cell: (sheet) => formatInstantDate(sheet.createdAt),
    },
    {
      key: "status",
      header: "Status",
      cell: (sheet) => <Badge tone={STATUS_TONE[sheet.status]}>{statusBadge(sheet.status)}</Badge>,
    },
    {
      key: "actions",
      header: "Ações",
      actions: true,
      cell: (sheet) => (
        <Button size="sm" aria-label={`Editar ficha ${sheet.title}`} onClick={() => edit(sheet)}>
          Editar
        </Button>
      ),
    },
  ];

  // O vazio depende do total de fichas do aluno, não das exibidas: a ficha em edição sai da lista.
  const otherSheets = sheets.filter((sheet) => sheet.id !== editing?.id);

  return (
    <div className="fb-ui-page">
      <PageHeader kicker="Fichas" title="Fichas de treino" />

      <div className="fb-ui-master">
        <StudentList
          students={clients}
          selectedId={clientId}
          allStudents={allStudents}
          onSelect={selectClient}
        />

        <div className="fb-ui-master__detail">
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
            <EmptyState title="Selecione um aluno para ver e montar fichas." />
          )}

          {selected && (
            <>
              <Card as="section" aria-labelledby={editorTitleId} className="fb-ui-sheet">
                <div className="fb-ui-sheet__head">
                  <h2 id={editorTitleId} className="fb-ui-sheet__title">
                    {editing ? `Editar ficha — ${editing.title}` : "Nova ficha"}
                  </h2>
                  <Badge tone="brand">Fichas de {selected.fullName}</Badge>
                  {editing && (
                    <Button
                      size="sm"
                      variant="soft"
                      className="fb-ui-sheet__new"
                      onClick={() => edit(null)}
                    >
                      + Nova ficha (nova fase)
                    </Button>
                  )}
                </div>

                {failure && <Alert>{failure}</Alert>}

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
              </Card>

              <Card as="section" aria-labelledby={listTitleId} className="fb-ui-sheet">
                <h2 id={listTitleId} className="fb-ui-sheet__title">
                  {editing ? "Fichas anteriores de" : "Fichas de"} {selected.fullName}
                </h2>
                <QueryBlockState
                  query={sheetsQuery}
                  hasData={sheetsQuery.data !== undefined}
                  loading="Carregando fichas…"
                  error="Não foi possível carregar as fichas."
                />
                {sheetsQuery.isSuccess && sheets.length === 0 && (
                  <EmptyState title="Este aluno ainda não tem fichas." />
                )}
                {otherSheets.length > 0 && (
                  <Table
                    label={`Fichas de ${selected.fullName}`}
                    columns={columns}
                    rows={otherSheets}
                    rowKey={(sheet) => sheet.id}
                  />
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
