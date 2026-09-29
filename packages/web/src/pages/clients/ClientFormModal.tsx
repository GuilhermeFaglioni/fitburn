import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createClientRequestSchema,
  updateClientRequestSchema,
  type ClientDetail,
} from "@fitburn/contracts";
import { Modal } from "../../components/Modal";
import { errorMessage } from "../../lib/auth/api";
import { createClient, getClient, updateClient } from "../../lib/clients/api";

interface FormValues {
  fullName: string;
  email: string;
  phone: string;
  birthDate: string;
  document: string;
  address: string;
  password: string;
}

const EMPTY: FormValues = {
  fullName: "",
  email: "",
  phone: "",
  birthDate: "",
  document: "",
  address: "",
  password: "",
};

const PERSONAL_FIELDS = ["fullName", "email", "phone", "birthDate", "document", "address"] as const;

/** Cadastro (sem `clientId`) ou edição de um cliente (Cadastro.dc.html, em diálogo). */
export function ClientFormModal({ clientId, onClose }: { clientId?: string; onClose: () => void }) {
  const detailQuery = useQuery({
    queryKey: ["clients", "detail", clientId],
    queryFn: () => getClient(clientId!),
    enabled: clientId !== undefined,
  });

  if (clientId === undefined) return <ClientForm onClose={onClose} />;

  return (
    <Modal title="Editar cliente" onClose={onClose}>
      {detailQuery.isError && <p role="alert">Não foi possível carregar o cliente.</p>}
      {detailQuery.isLoading && <p className="fb-note">Carregando…</p>}
      {detailQuery.data && <ClientForm client={detailQuery.data} onClose={onClose} embedded />}
    </Modal>
  );
}

function initialValues(client?: ClientDetail): FormValues {
  if (!client) return EMPTY;
  return {
    ...EMPTY,
    fullName: client.fullName,
    email: client.email,
    phone: client.phone ?? "",
    birthDate: client.birthDate ?? "",
    document: client.document ?? "",
    address: client.address ?? "",
  };
}

function ClientForm({
  client,
  onClose,
  embedded = false,
}: {
  client?: ClientDetail;
  onClose: () => void;
  /** Dentro do diálogo de edição (que já tem o título e o Modal). */
  embedded?: boolean;
}) {
  const formId = useId();
  const queryClient = useQueryClient();
  const isEdit = client !== undefined;
  const [original] = useState(() => initialValues(client));
  const [values, setValues] = useState<FormValues>(original);
  const [problems, setProblems] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!isEdit) {
        const parsed = createClientRequestSchema.safeParse(values);
        if (!parsed.success)
          throw new ValidationProblems(parsed.error.issues.map((i) => i.message));
        return createClient(parsed.data);
      }
      // Só o que mudou vai: um cliente antigo sem telefone, por exemplo, pode ser editado sem preenchê-lo.
      const changes: Record<string, string> = {};
      for (const field of PERSONAL_FIELDS) {
        if (values[field].trim() !== original[field]) changes[field] = values[field];
      }
      if (Object.keys(changes).length === 0) return null;
      const parsed = updateClientRequestSchema.safeParse(changes);
      if (!parsed.success) throw new ValidationProblems(parsed.error.issues.map((i) => i.message));
      return updateClient(client.id, parsed.data);
    },
    onMutate: () => setProblems([]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      onClose();
    },
    onError: (error) =>
      setProblems(
        error instanceof ValidationProblems
          ? error.messages
          : [errorMessage(error, "Não foi possível salvar o cliente.")],
      ),
  });

  const set = (field: keyof FormValues) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  const form = (
    <form onSubmit={handleSubmit} noValidate aria-label={isEdit ? "Edição de cliente" : undefined}>
      <div className="fb-client-form">
        {problems.length > 0 && (
          <div role="alert" className="fb-error-box fb-client-form__wide">
            {problems.length === 1 ? (
              problems[0]
            ) : (
              <ul>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="fb-modal__field fb-client-form__wide">
          <label htmlFor={`${formId}-fullName`}>Nome completo</label>
          <input
            id={`${formId}-fullName`}
            className="fb-field"
            placeholder="Nome e sobrenome"
            value={values.fullName}
            onChange={set("fullName")}
          />
        </div>
        <div className="fb-modal__field">
          <label htmlFor={`${formId}-email`}>E-mail</label>
          <input
            id={`${formId}-email`}
            className="fb-field"
            type="email"
            placeholder="email@exemplo.com"
            value={values.email}
            onChange={set("email")}
          />
        </div>
        <div className="fb-modal__field">
          <label htmlFor={`${formId}-phone`}>Telefone</label>
          <input
            id={`${formId}-phone`}
            className="fb-field"
            type="tel"
            placeholder="(00) 00000-0000"
            value={values.phone}
            onChange={set("phone")}
          />
        </div>
        <div className="fb-modal__field">
          <label htmlFor={`${formId}-birthDate`}>Data de nascimento</label>
          <input
            id={`${formId}-birthDate`}
            className="fb-field"
            type="date"
            value={values.birthDate}
            onChange={set("birthDate")}
          />
        </div>
        <div className="fb-modal__field">
          <label htmlFor={`${formId}-document`}>Documento</label>
          <input
            id={`${formId}-document`}
            className="fb-field"
            placeholder="000.000.000-00"
            value={values.document}
            onChange={set("document")}
          />
        </div>
        <div className="fb-modal__field fb-client-form__wide">
          <label htmlFor={`${formId}-address`}>Endereço</label>
          <input
            id={`${formId}-address`}
            className="fb-field"
            placeholder="Rua, número, bairro, cidade"
            value={values.address}
            onChange={set("address")}
          />
        </div>
        {!isEdit && (
          <div className="fb-modal__field fb-client-form__wide">
            <label htmlFor={`${formId}-password`}>Senha inicial</label>
            <input
              id={`${formId}-password`}
              className="fb-field"
              type="password"
              value={values.password}
              onChange={set("password")}
            />
            <span className="fb-note">
              Definida por você e comunicada ao cliente fora do sistema.
            </span>
          </div>
        )}
      </div>

      <div className="fb-modal__footer fb-client-form__footer">
        <button type="button" className="fb-btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="fb-btn-primary" disabled={mutation.isPending}>
          {isEdit ? "Salvar" : "Salvar cliente"}
        </button>
      </div>
    </form>
  );

  if (embedded) return form;
  return (
    <Modal title="Novo cliente" onClose={onClose}>
      {form}
    </Modal>
  );
}

class ValidationProblems extends Error {
  constructor(public readonly messages: string[]) {
    super(messages.join(" "));
  }
}
