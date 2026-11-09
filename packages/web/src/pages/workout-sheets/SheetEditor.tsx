import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  MAX_WORKOUT_EXERCISES,
  WorkoutSheetStatus,
  createWorkoutSheetRequestSchema,
  type WorkoutExerciseInput,
  type WorkoutSheet,
  type WorkoutSheetStatusName,
} from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
import { HealthDataNotice } from "../../components/HealthDataNotice";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";
import { EmptyState } from "../../components/ui/States";
import { Textarea } from "../../components/ui/Textarea";
import { STATUS_LABEL } from "./status";

export interface SheetFormValues {
  title: string;
  notes: string;
  status: WorkoutSheetStatusName;
  /** Só as linhas com nome; as linhas em branco não vão. */
  exercises: WorkoutExerciseInput[];
}

type ExerciseField = "name" | "sets" | "reps" | "load" | "duration" | "distance" | "notes";

interface ExerciseDraft extends Record<ExerciseField, string> {
  /** Identidade da linha na tela, para reordenar sem perder o que foi digitado. */
  key: number;
}

/** Os campos curtos de cada exercício, na ordem da tela. O nome e as observações ocupam a linha toda. */
const SHORT_FIELDS = [
  { field: "sets", label: "Séries" },
  { field: "reps", label: "Repetições" },
  { field: "load", label: "Carga" },
  { field: "duration", label: "Tempo" },
  { field: "distance", label: "Distância" },
] as const;

const EXERCISE_FIELDS: readonly ExerciseField[] = [
  "name",
  ...SHORT_FIELDS.map(({ field }) => field),
  "notes",
];

type RowErrors = Partial<Record<ExerciseField, string>>;

interface FormErrors {
  title?: string;
  notes?: string;
  /** Erros dos campos de cada exercício, pela chave da linha. */
  rows: Record<number, RowErrors>;
}

const NO_ERRORS: FormErrors = { rows: {} };

interface SheetEditorProps {
  /** A ficha em edição; null para montar uma nova. Troque a `key` ao mudar de ficha. */
  editing: WorkoutSheet | null;
  allowed: boolean;
  pending: boolean;
  /** Sai da edição (em modo de criação a tela recomeça o formulário em branco). */
  onCancel: () => void;
  /** Rejeita se a API recusou: a tela mostra o motivo e o formulário mantém o que foi digitado. */
  onSubmit: (values: SheetFormValues) => Promise<void>;
}

function blankRow(key: number): ExerciseDraft {
  return { key, name: "", sets: "", reps: "", load: "", duration: "", distance: "", notes: "" };
}

/** A linha tem algo digitado? Linha inteira em branco é ignorada ao salvar; a que tem dados mas não tem nome é erro. */
function isTouched(row: ExerciseDraft): boolean {
  return EXERCISE_FIELDS.some((field) => row[field].trim() !== "");
}

/** Como a tela chama o exercício: o nome, ou a posição enquanto o nome está em branco. */
function rowName(row: ExerciseDraft, index: number): string {
  return row.name.trim() || `${index + 1}`;
}

/**
 * Editor de ficha do professor: título, status, observações e a lista de exercícios. Cada exercício é um `Card`
 * com campos de nome, séries, repetições, carga, tempo, distância e observações, e as ações de subir, descer e
 * remover (esta pede confirmação em diálogo). Repetições, tempo e distância são campos separados, como o contrato.
 *
 * Validação com o schema do contrato (título obrigatório e os limites de tamanho): o erro aparece no campo, com
 * `aria-invalid`, e o foco vai ao primeiro campo com erro. A recusa da API fica a cargo de quem chama.
 */
export function SheetEditor({ editing, allowed, pending, onCancel, onSubmit }: SheetEditorProps) {
  const id = useId();
  const [nextKey, setNextKey] = useState(() => (editing?.exercises.length ?? 0) + 1);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [status, setStatus] = useState<WorkoutSheetStatusName>(
    editing?.status ?? WorkoutSheetStatus.ACTIVE,
  );
  const [rows, setRows] = useState<ExerciseDraft[]>(() =>
    (editing?.exercises ?? []).map((exercise, index) => ({
      key: index + 1,
      name: exercise.name,
      sets: exercise.sets ?? "",
      reps: exercise.reps ?? "",
      load: exercise.load ?? "",
      duration: exercise.duration ?? "",
      distance: exercise.distance ?? "",
      notes: exercise.notes ?? "",
    })),
  );
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [removing, setRemoving] = useState<number | null>(null);

  const listRef = useRef<HTMLUListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  /** Quem recebe o foco depois da próxima mudança nas linhas (adicionar, mover, remover). */
  const focusAfterRef = useRef<(() => HTMLElement | null) | null>(null);

  useEffect(() => {
    const find = focusAfterRef.current;
    if (!find) return;
    focusAfterRef.current = null;
    find()?.focus();
  }, [rows]);

  const fieldId = (key: number, field: ExerciseField) => `${id}-${key}-${field}`;

  function addRow() {
    const key = nextKey;
    setRows((current) => [...current, blankRow(key)]);
    setNextKey(key + 1);
    focusAfterRef.current = () => document.getElementById(fieldId(key, "name"));
  }

  function changeRow(key: number, field: ExerciseField, value: string) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  }

  function moveRow(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= rows.length) return;
    const key = rows[index]!.key;
    setRows((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    // O botão que acabou de ser usado continua com o foco, mesmo que a linha tenha mudado de lugar.
    const action = offset === -1 ? "up" : "down";
    focusAfterRef.current = () =>
      listRef.current?.querySelector<HTMLElement>(`[data-row="${key}"] [data-action="${action}"]`) ??
      null;
  }

  function confirmRemoval() {
    if (removing === null) return;
    setRows((current) => current.filter((row) => row.key !== removing));
    setErrors((current) => {
      const rest = { ...current.rows };
      delete rest[removing];
      return { ...current, rows: rest };
    });
    setRemoving(null);
    // A linha com o botão que abriu o diálogo saiu da tela: o foco volta para "Adicionar exercício".
    focusAfterRef.current = () => addRef.current;
  }

  function toExercise(row: ExerciseDraft): WorkoutExerciseInput {
    const exercise: WorkoutExerciseInput = { name: row.name.trim() };
    for (const { field } of SHORT_FIELDS) {
      if (row[field].trim() !== "") exercise[field] = row[field].trim();
    }
    if (row.notes.trim() !== "") exercise.notes = row.notes.trim();
    return exercise;
  }

  /** Valida com o contrato; devolve os erros por campo (vazio se está tudo certo). */
  function validate(named: ExerciseDraft[]): FormErrors {
    const found: FormErrors = { rows: {} };
    // Linha com dados e sem nome: erro no nome (em vez de descartar o que foi digitado sem avisar).
    for (const row of rows) {
      if (isTouched(row) && row.name.trim() === "") {
        found.rows[row.key] = { name: "Informe o nome do exercício." };
      }
    }
    const parsed = createWorkoutSheetRequestSchema.safeParse({
      clientId: "cliente",
      title,
      notes,
      status,
      exercises: named.map(toExercise),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [head, index, field] = issue.path;
        if (head === "title" && !found.title) found.title = issue.message;
        else if (head === "notes" && !found.notes) found.notes = issue.message;
        else if (head === "exercises" && typeof index === "number" && typeof field === "string") {
          const row = named[index];
          if (!row) continue;
          const current = found.rows[row.key] ?? {};
          if (!current[field as ExerciseField]) current[field as ExerciseField] = issue.message;
          found.rows[row.key] = current;
        }
      }
    }
    return found;
  }

  function firstInvalidId(found: FormErrors): string | null {
    if (found.title) return `${id}-title`;
    if (found.notes) return `${id}-notes`;
    for (const row of rows) {
      const rowErrors = found.rows[row.key];
      const field = EXERCISE_FIELDS.find((name) => rowErrors?.[name]);
      if (field) return fieldId(row.key, field);
    }
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const named = rows.filter((row) => row.name.trim() !== "");
    const found = validate(named);
    setErrors(found);
    const invalid = firstInvalidId(found);
    if (invalid) {
      document.getElementById(invalid)?.focus();
      return;
    }
    try {
      await onSubmit({
        title: title.trim(),
        notes: notes.trim(),
        status,
        exercises: named.map(toExercise),
      });
    } catch {
      // Já tratado por quem chamou: o formulário fica como está para tentar de novo.
    }
  }

  const removingIndex = rows.findIndex((row) => row.key === removing);
  const removingRow = removingIndex >= 0 ? rows[removingIndex] : undefined;

  return (
    <form className="fb-ui-sheet-form" noValidate onSubmit={(event) => void submit(event)}>
      <HealthDataNotice />
      <div className="fb-ui-form-grid">
        <Field
          id={`${id}-title`}
          label="Título"
          placeholder="Ex.: Fase 2"
          value={title}
          error={errors.title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Select
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value as WorkoutSheetStatusName)}
        >
          {Object.values(WorkoutSheetStatus).map((value) => (
            <option key={value} value={value}>
              {STATUS_LABEL[value]}
            </option>
          ))}
        </Select>
        <Textarea
          id={`${id}-notes`}
          className="fb-ui-field--full"
          label="Observações gerais"
          rows={2}
          placeholder="Orientações para a ficha toda (opcional)"
          value={notes}
          error={errors.notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="fb-ui-sheet-form__exercises">
        <div className="fb-ui-sheet-form__head">
          <h3 className="fb-ui-sheet-form__title">Exercícios</h3>
          <Button
            ref={addRef}
            size="sm"
            variant="soft"
            disabled={rows.length >= MAX_WORKOUT_EXERCISES}
            onClick={addRow}
          >
            + Adicionar exercício
          </Button>
        </div>

        {rows.length === 0 && (
          <EmptyState
            title="Nenhum exercício ainda."
            description="Adicione o primeiro para montar a ficha."
          />
        )}
        {rows.length > 0 && (
          <ul ref={listRef} className="fb-ui-ex-list">
            {rows.map((row, index) => {
              const name = rowName(row, index);
              const rowErrors = errors.rows[row.key] ?? {};
              const edge = (isEdge: boolean, move: () => void) => ({
                // aria-disabled (e não disabled): o botão usado não perde o foco ao chegar na ponta da lista.
                "aria-disabled": isEdge ? true : undefined,
                onClick: () => {
                  if (!isEdge) move();
                },
              });
              return (
                <li key={row.key} data-row={row.key}>
                  <Card
                    flat
                    role="group"
                    aria-label={`Exercício ${index + 1}`}
                    className="fb-ui-ex"
                  >
                    <div className="fb-ui-ex__fields">
                      <Field
                        id={fieldId(row.key, "name")}
                        className="fb-ui-ex__wide"
                        label="Exercício"
                        value={row.name}
                        error={rowErrors.name}
                        onChange={(event) => changeRow(row.key, "name", event.target.value)}
                      />
                      {SHORT_FIELDS.map(({ field, label }) => (
                        <Field
                          key={field}
                          id={fieldId(row.key, field)}
                          label={label}
                          value={row[field]}
                          error={rowErrors[field]}
                          onChange={(event) => changeRow(row.key, field, event.target.value)}
                        />
                      ))}
                      <Field
                        id={fieldId(row.key, "notes")}
                        className="fb-ui-ex__wide"
                        label="Observações"
                        value={row.notes}
                        error={rowErrors.notes}
                        onChange={(event) => changeRow(row.key, "notes", event.target.value)}
                      />
                    </div>
                    <div className="fb-ui-ex__actions">
                      <Button
                        size="sm"
                        className="fb-ui-ex__move"
                        aria-label={`Subir exercício ${name}`}
                        title="Subir"
                        data-action="up"
                        {...edge(index === 0, () => moveRow(index, -1))}
                      >
                        <span aria-hidden="true">↑</span>
                      </Button>
                      <Button
                        size="sm"
                        className="fb-ui-ex__move"
                        aria-label={`Descer exercício ${name}`}
                        title="Descer"
                        data-action="down"
                        {...edge(index === rows.length - 1, () => moveRow(index, 1))}
                      >
                        <span aria-hidden="true">↓</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost-danger"
                        aria-label={`Remover exercício ${name}`}
                        onClick={() => setRemoving(row.key)}
                      >
                        Remover
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="fb-ui-form-actions">
        <Button onClick={onCancel}>Cancelar</Button>
        <BlockedAction allowed={allowed} reason="Você não tem permissão para esta ação.">
          <Button type="submit" variant="primary" busy={pending}>
            Salvar ficha
          </Button>
        </BlockedAction>
      </div>

      {removingRow && (
        <Dialog
          title={`Remover o exercício ${rowName(removingRow, removingIndex)}?`}
          description="Ele deixa a ficha quando você salvar."
          onClose={() => setRemoving(null)}
          actions={
            <>
              <Button onClick={() => setRemoving(null)}>Cancelar</Button>
              <Button variant="danger" onClick={confirmRemoval}>
                Remover exercício
              </Button>
            </>
          }
        />
      )}
    </form>
  );
}
