import { useId, useState, type FormEvent } from "react";
import {
  MAX_WORKOUT_EXERCISES,
  WorkoutSheetStatus,
  type WorkoutExerciseInput,
  type WorkoutSheet,
  type WorkoutSheetStatusName,
} from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";
import { STATUS_LABEL } from "./status";

export interface SheetFormValues {
  title: string;
  notes: string;
  status: WorkoutSheetStatusName;
  /** Só as linhas com nome; os campos em branco não vão. */
  exercises: WorkoutExerciseInput[];
}

interface ExerciseDraft {
  /** Identidade da linha na tela, para reordenar sem perder o que foi digitado. */
  key: number;
  name: string;
  sets: string;
  reps: string;
  load: string;
  duration: string;
  distance: string;
  notes: string;
}

const EXERCISE_FIELDS = [
  { field: "sets", label: "Séries" },
  { field: "reps", label: "Repetições" },
  { field: "load", label: "Carga" },
  { field: "duration", label: "Tempo" },
  { field: "distance", label: "Distância" },
] as const;

interface SheetEditorProps {
  /** A ficha em edição; null para montar uma nova. Troque a `key` ao mudar de ficha. */
  editing: WorkoutSheet | null;
  allowed: boolean;
  pending: boolean;
  /** Sai da edição (em modo de criação só limpa o formulário). */
  onCancel: () => void;
  /** Rejeita se a API recusou: a tela mostra o motivo e o formulário mantém o que foi digitado. */
  onSubmit: (values: SheetFormValues) => Promise<void>;
}

/**
 * Editor de ficha do professor (FichaTreinoAdmin.dc.html): título, observações,
 * status e a lista de exercícios em linhas repetíveis (adicionar, subir,
 * descer e remover). O artboard tem "Repetições / tempo" numa coluna só; aqui
 * repetições, tempo e distância são campos separados, como o spec pede.
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

  function addRow() {
    setRows((current) => [
      ...current,
      {
        key: nextKey,
        name: "",
        sets: "",
        reps: "",
        load: "",
        duration: "",
        distance: "",
        notes: "",
      },
    ]);
    setNextKey((current) => current + 1);
  }

  function changeRow(key: number, field: keyof Omit<ExerciseDraft, "key">, value: string) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  }

  function moveRow(index: number, offset: -1 | 1) {
    setRows((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function toExercises(): WorkoutExerciseInput[] {
    return rows
      .filter((row) => row.name.trim() !== "")
      .map((row) => {
        const exercise: WorkoutExerciseInput = { name: row.name.trim() };
        for (const { field } of EXERCISE_FIELDS) {
          if (row[field].trim() !== "") exercise[field] = row[field].trim();
        }
        if (row.notes.trim() !== "") exercise.notes = row.notes.trim();
        return exercise;
      });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({
        title: title.trim(),
        notes: notes.trim(),
        status,
        exercises: toExercises(),
      });
    } catch {
      // Já tratado por quem chamou: o formulário fica como está para tentar de novo.
    }
  }

  return (
    <form className="fb-sheets__form" onSubmit={(event) => void submit(event)}>
      <div className="fb-sheets__form-top">
        <div className="fb-modal__field fb-sheets__grow">
          <label htmlFor={`${id}-title`}>Título</label>
          <input
            id={`${id}-title`}
            type="text"
            className="fb-field"
            placeholder="Ex.: Fase 2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="fb-modal__field">
          <label htmlFor={`${id}-status`}>Status</label>
          <select
            id={`${id}-status`}
            className="fb-field"
            value={status}
            onChange={(event) => setStatus(event.target.value as WorkoutSheetStatusName)}
          >
            {Object.values(WorkoutSheetStatus).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="fb-modal__field">
        <label htmlFor={`${id}-notes`}>Observações gerais</label>
        <textarea
          id={`${id}-notes`}
          className="fb-field"
          rows={2}
          placeholder="Orientações para a ficha toda (opcional)"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="fb-sheets__exercises-head">
        <span className="fb-sheets__section-title">Exercícios</span>
        <button
          type="button"
          className="fb-btn-dashed"
          disabled={rows.length >= MAX_WORKOUT_EXERCISES}
          onClick={addRow}
        >
          + Adicionar exercício
        </button>
      </div>
      {rows.length === 0 && (
        <p className="fb-note">Nenhum exercício ainda. Adicione o primeiro para montar a ficha.</p>
      )}
      <div className="fb-sheets__rows">
        {rows.map((row, index) => (
          <div
            key={row.key}
            className="fb-sheets__row"
            role="group"
            aria-label={`Exercício ${index + 1}`}
          >
            <div className="fb-sheets__row-fields">
              <div className="fb-modal__field fb-sheets__name">
                <label htmlFor={`${id}-${row.key}-name`}>Exercício</label>
                <input
                  id={`${id}-${row.key}-name`}
                  type="text"
                  className="fb-field"
                  value={row.name}
                  onChange={(event) => changeRow(row.key, "name", event.target.value)}
                />
              </div>
              {EXERCISE_FIELDS.map(({ field, label }) => (
                <div key={field} className="fb-modal__field fb-sheets__short">
                  <label htmlFor={`${id}-${row.key}-${field}`}>{label}</label>
                  <input
                    id={`${id}-${row.key}-${field}`}
                    type="text"
                    className="fb-field"
                    value={row[field]}
                    onChange={(event) => changeRow(row.key, field, event.target.value)}
                  />
                </div>
              ))}
              <div className="fb-modal__field fb-sheets__row-notes">
                <label htmlFor={`${id}-${row.key}-notes`}>Observações</label>
                <input
                  id={`${id}-${row.key}-notes`}
                  type="text"
                  className="fb-field"
                  value={row.notes}
                  onChange={(event) => changeRow(row.key, "notes", event.target.value)}
                />
              </div>
            </div>
            <div className="fb-sheets__row-actions">
              <button
                type="button"
                className="fb-row-btn"
                disabled={index === 0}
                onClick={() => moveRow(index, -1)}
              >
                Subir
              </button>
              <button
                type="button"
                className="fb-row-btn"
                disabled={index === rows.length - 1}
                onClick={() => moveRow(index, 1)}
              >
                Descer
              </button>
              <button
                type="button"
                className="fb-row-btn fb-row-btn--danger"
                onClick={() => removeRow(row.key)}
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="fb-sheets__form-footer">
        <button type="button" className="fb-btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <BlockedAction allowed={allowed} reason="Você não tem permissão para esta ação.">
          <button
            type="submit"
            className="fb-btn-primary"
            disabled={title.trim() === "" || pending}
          >
            Salvar ficha
          </button>
        </BlockedAction>
      </div>
    </form>
  );
}
