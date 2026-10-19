import { useId, useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { UserDetail } from "@fitburn/contracts";
import { ApiError } from "../lib/auth/api";
import { resetUserPassword } from "../lib/users/api";
import { Modal } from "./Modal";

export function ResetUserPasswordDialog({
  user,
  onReset,
  onClose,
}: {
  user: Pick<UserDetail, "id" | "fullName" | "email">;
  onReset: () => void;
  onClose: () => void;
}) {
  const inputId = useId();
  const [newPassword, setNewPassword] = useState("");
  const submitting = useRef(false);
  const mutation = useMutation({
    mutationFn: () => resetUserPassword(user.id, newPassword),
    onSuccess: () => {
      setNewPassword("");
      onReset();
    },
    onError: () => setNewPassword(""),
  });

  function handleClose() {
    if (mutation.isPending) return;
    setNewPassword("");
    mutation.reset();
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    mutation.mutate(undefined, {
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  const errorMessage = mutation.isError
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : "Não foi possível redefinir a senha. Tente novamente."
    : null;

  return (
    <Modal title="Redefinir senha?" onClose={handleClose}>
      <form onSubmit={handleSubmit} className="fb-modal__form">
        <p className="fb-modal__text">
          A senha de <strong>{user.fullName}</strong> ({user.email}) será substituída. As sessões
          atuais serão encerradas.
        </p>
        <div className="fb-modal__field">
          <label htmlFor={inputId}>Nova senha</label>
          <input
            id={inputId}
            className="fb-field"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            required
          />
          <span className="fb-note">Use pelo menos 8 caracteres.</span>
        </div>
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
            onClick={handleClose}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="fb-btn-primary fb-btn-primary--sm"
            disabled={mutation.isPending || newPassword.length < 8}
          >
            {mutation.isPending ? "Redefinindo…" : "Confirmar redefinição"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
