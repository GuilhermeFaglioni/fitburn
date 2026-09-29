import { useId, useState, type FormEvent } from "react";
import type { GoalDetail } from "@fitburn/contracts";
import { BlockedAction } from "../../components/BlockedAction";

export interface GoalFormValues {
  title: string;
  description: string;
  dueDate: string;
}

interface GoalFormProps {
  /** A meta em edição; null para criar uma nova. Troque a `key` ao mudar de meta. */
  editing: GoalDetail | null;
  allowed: boolean;
  pending: boolean;
  /** Sai da edição (em modo de criação só limpa o formulário). */
  onCancel: () => void;
  /** Rejeita se a API recusou: a tela mostra o motivo e o formulário mantém o que foi digitado. */
  onSubmit: (values: GoalFormValues) => Promise<void>;
}

/** "+ Nova meta" do artboard (MetasAdmin.dc.html), que também edita uma meta ativa. */
export function GoalForm({ editing, allowed, pending, onCancel, onSubmit }: GoalFormProps) {
  const id = useId();
  const initial: GoalFormValues = {
    title: editing?.title ?? "",
    description: editing?.description ?? "",
    dueDate: editing?.dueDate ?? "",
  };
  const [values, setValues] = useState(initial);
  const empty: GoalFormValues = { title: "", description: "", dueDate: "" };

  function change(field: keyof GoalFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSubmit({
        ...values,
        title: values.title.trim(),
        description: values.description.trim(),
      });
      if (!editing) setValues(empty);
    } catch {
      // Já tratado por quem chamou: o formulário fica como está para tentar de novo.
    }
  }

  return (
    <form className="fb-goals__form" onSubmit={(event) => void submit(event)}>
      <span className="fb-goals__form-title">{editing ? "Editar meta" : "+ Nova meta"}</span>
      <div className="fb-modal__field">
        <label htmlFor={`${id}-title`}>Título</label>
        <input
          id={`${id}-title`}
          type="text"
          className="fb-field"
          placeholder="Ex.: Frequentar 10 aulas no mês"
          value={values.title}
          onChange={(event) => change("title", event.target.value)}
        />
      </div>
      <div className="fb-modal__field">
        <label htmlFor={`${id}-description`}>Descrição</label>
        <input
          id={`${id}-description`}
          type="text"
          className="fb-field"
          placeholder="Detalhe opcional sobre a meta"
          value={values.description}
          onChange={(event) => change("description", event.target.value)}
        />
      </div>
      <div className="fb-modal__field">
        <label htmlFor={`${id}-due-date`}>Prazo</label>
        <input
          id={`${id}-due-date`}
          type="date"
          className="fb-field"
          value={values.dueDate}
          onChange={(event) => change("dueDate", event.target.value)}
        />
      </div>
      <div className="fb-goals__form-footer">
        <button
          type="button"
          className="fb-btn-secondary"
          onClick={() => {
            setValues(editing ? initial : empty);
            onCancel();
          }}
        >
          Cancelar
        </button>
        <BlockedAction allowed={allowed} reason="Você não tem permissão para esta ação.">
          <button
            type="submit"
            className="fb-btn-primary"
            disabled={values.title.trim() === "" || pending}
          >
            {editing ? "Salvar" : "Criar meta"}
          </button>
        </BlockedAction>
      </div>
    </form>
  );
}
