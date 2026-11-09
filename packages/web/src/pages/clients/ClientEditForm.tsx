import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  updateClientRequestSchema,
  type ClientUserResponse,
  type UpdateClientRequest,
} from "@fitburn/contracts";
import { ApiError } from "../../lib/auth/api";
import { updateClientRecord } from "../../lib/clients/api";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

const ERROR_MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_IN_USE: "Este e-mail já está em uso.",
  DOCUMENT_ALREADY_IN_USE: "Este documento já está em uso.",
  VALIDATION_ERROR: "Confira os campos e tente novamente.",
};

/** Edição dos dados pessoais de um cliente (sem perfil de acesso, status nem senha), num `Card` com `Field`. */
export function ClientEditForm({
  client,
  onDone,
}: {
  client: ClientUserResponse;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(client.fullName);
  const [email, setEmail] = useState(client.email);
  const [phone, setPhone] = useState(client.phone ?? "");
  const [birthDate, setBirthDate] = useState(client.birthDate ?? "");
  const [documentNumber, setDocumentNumber] = useState(client.document ?? "");
  const [address, setAddress] = useState(client.address ?? "");
  const canEditFullDetails =
    client.birthDate !== undefined && client.document !== undefined && client.address !== undefined;

  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: UpdateClientRequest) => updateClientRecord(client.id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      onDone();
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const input: UpdateClientRequest = {
      fullName,
      email,
      phone,
    };
    if (canEditFullDetails) {
      input.birthDate = birthDate;
      input.document = blankToNull(documentNumber);
      input.address = blankToNull(address);
    }
    const parsed = updateClientRequestSchema.safeParse(input);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }
    setValidationError(null);
    mutation.mutate(parsed.data);
  }

  const error = mutation.error;
  const errorMessage = validationError
    ? validationError
    : error
      ? error instanceof ApiError
        ? (ERROR_MESSAGES[error.code] ?? error.message)
        : "Não foi possível salvar o cliente."
      : null;

  return (
    <Card
      as="form"
      className="fb-ui-card--form"
      onSubmit={handleSubmit}
      aria-label="Edição de cliente"
    >
      <div className="fb-ui-form-grid">
        {errorMessage && <Alert className="fb-ui-field--full">{errorMessage}</Alert>}
        <Field
          className="fb-ui-field--full"
          label="Nome completo"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          required
        />
        <Field
          label="E-mail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Field
          label="Telefone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
        />
        {canEditFullDetails && (
          <>
            <Field
              label="Data de nascimento"
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              required
            />
            <Field
              label="Documento"
              value={documentNumber}
              onChange={(event) => setDocumentNumber(event.target.value)}
            />
            <Field
              className="fb-ui-field--full"
              label="Endereço"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </>
        )}
      </div>
      <div className="fb-ui-form-actions">
        <Button onClick={onDone}>Cancelar</Button>
        <Button type="submit" variant="primary" busy={mutation.isPending}>
          {mutation.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </Card>
  );
}
