import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SystemProfileName, type UserDetail } from "@fitburn/contracts";
import { Modal } from "../components/Modal";
import { ApiError } from "../lib/auth/api";
import { listProfiles } from "../lib/profiles/api";
import { createStaff, updateUser } from "../lib/users/api";

const ERROR_MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_IN_USE: "Este e-mail já está em uso.",
  VALIDATION_ERROR: "Confira os campos e tente novamente.",
};

/**
 * Cadastro e edição de um membro da equipe (nome, e-mail e perfil de acesso).
 * O artboard só mostra os botões "+ Novo usuário" e "Editar"; o formulário usa
 * o padrão dos demais diálogos administrativos.
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
  const formId = useId();
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  const errorMessage = mutation.isError
    ? mutation.error instanceof ApiError
      ? (ERROR_MESSAGES[mutation.error.code] ?? mutation.error.message)
      : "Não foi possível salvar o usuário."
    : null;

  return (
    <Modal title={user ? "Editar usuário" : "Novo usuário"} onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        aria-label={user ? "Edição de usuário" : "Cadastro de usuário"}
        className="fb-modal__form"
      >
        <div className="fb-modal__field">
          <label htmlFor={`${formId}-name`}>Nome completo</label>
          <input
            id={`${formId}-name`}
            className="fb-field"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </div>
        <div className="fb-modal__field">
          <label htmlFor={`${formId}-email`}>E-mail</label>
          <input
            id={`${formId}-email`}
            className="fb-field"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="fb-modal__field">
          <label htmlFor={`${formId}-profile`}>Perfil de acesso</label>
          <select
            id={`${formId}-profile`}
            className="fb-field"
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
          </select>
        </div>
        {!user && (
          <div className="fb-modal__field">
            <label htmlFor={`${formId}-password`}>Senha inicial</label>
            <input
              id={`${formId}-password`}
              className="fb-field"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </div>
        )}
        {errorMessage && (
          <p role="alert" className="fb-error-box">
            {errorMessage}
          </p>
        )}
        <div className="fb-modal__footer fb-modal__footer--end">
          <button
            type="button"
            className="fb-btn-secondary"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="fb-btn-primary fb-btn-primary--sm"
            disabled={mutation.isPending}
          >
            {user ? "Salvar" : "Criar usuário"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
