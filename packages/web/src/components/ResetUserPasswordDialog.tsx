import { useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { UserDetail } from "@fitburn/contracts";
import { ApiError } from "../lib/auth/api";
import { resetUserPassword } from "../lib/users/api";
import { Alert } from "./ui/Alert";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Field } from "./ui/Field";

export function ResetUserPasswordDialog({
  user,
  onReset,
  onClose,
}: {
  user: Pick<UserDetail, "id" | "fullName" | "email">;
  onReset: () => void;
  onClose: () => void;
}) {
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
    <Dialog
      title="Redefinir senha?"
      onClose={handleClose}
      description={
        <>
          A senha de <strong>{user.fullName}</strong> ({user.email}) será substituída. As sessões
          atuais serão encerradas.
        </>
      }
    >
      <form onSubmit={handleSubmit} className="fb-ui-dialog__form">
        <Field
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          minLength={8}
          required
          help="Use pelo menos 8 caracteres."
        />
        {errorMessage && <Alert>{errorMessage}</Alert>}
        <div className="fb-ui-dialog__actions">
          <Button disabled={mutation.isPending} onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            busy={mutation.isPending}
            disabled={newPassword.length < 8}
          >
            {mutation.isPending ? "Redefinindo…" : "Confirmar redefinição"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
