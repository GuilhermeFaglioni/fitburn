import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SystemProfileName, type UserDetail } from "@fitburn/contracts";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Field } from "../components/ui/Field";
import { Select } from "../components/ui/Select";
import { ApiError } from "../lib/auth/api";
import { listProfiles } from "../lib/profiles/api";
import { createStaff, updateUser } from "../lib/users/api";

const ERROR_MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_IN_USE: "Este e-mail já está em uso.",
  VALIDATION_ERROR: "Confira os campos e tente novamente.",
};

/**
 * Cadastro e edição de um membro da equipe (nome, e-mail e perfil de acesso), em `Dialog` (D-038, #156).
 * O preview só mostra os botões "+ Novo usuário" e "Editar"; o formulário usa o padrão dos diálogos do admin.
 */
export function StaffFormModal({
  user,
  onSaved,
  onClose,
}: {
  /** Sem `user`, cadastra um novo membro da equipe. */
  user?: UserDetail;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [profileId, setProfileId] = useState(user?.profile.id ?? "");
  const [password, setPassword] = useState("");

  const profilesQuery = useQuery({ queryKey: ["profiles"], queryFn: listProfiles });
  // O perfil Cliente é de quem treina: essa conta se cadastra em Clientes.
  const profiles = (profilesQuery.data ?? []).filter(
    (profile) =>
      profile.name !== SystemProfileName.CLIENT && (profile.isActive || profile.id === profileId),
  );

  const mutation = useMutation({
    mutationFn: () =>
      user
        ? updateUser(user.id, { fullName, email, profileId })
        : createStaff({ fullName, email, password, profileId }),
    onSuccess: onSaved,
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  const errorMessage = mutation.isError
    ? mutation.error instanceof ApiError
      ? (ERROR_MESSAGES[mutation.error.code] ?? mutation.error.message)
      : "Não foi possível salvar o usuário."
    : null;

  return (
    <Dialog title={user ? "Editar usuário" : "Novo usuário"} onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        aria-label={user ? "Edição de usuário" : "Cadastro de usuário"}
        className="fb-ui-dialog__form"
      >
        <Field
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
        <Select
          label="Perfil de acesso"
          value={profileId}
          onChange={(event) => setProfileId(event.target.value)}
          required
        >
          <option value="">Selecione um perfil</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
          {user && !profiles.some((profile) => profile.id === user.profile.id) && (
            <option value={user.profile.id}>{user.profile.name}</option>
          )}
        </Select>
        {!user && (
          <Field
            label="Senha inicial"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        )}
        {errorMessage && <Alert>{errorMessage}</Alert>}
        <div className="fb-ui-dialog__actions">
          <Button disabled={mutation.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" busy={mutation.isPending}>
            {user ? "Salvar" : "Criar usuário"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
