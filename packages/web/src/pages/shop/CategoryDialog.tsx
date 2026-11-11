import { useState, type FormEvent } from "react";
import { createShopCategoryRequestSchema, type ShopCategory } from "@fitburn/contracts";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { errorMessage } from "../../lib/auth/api";
import { useCreateShopCategory, useRenameShopCategory } from "../../lib/shop/api";
import { RequiresNetwork } from "../../components/RequiresNetwork";

/**
 * Diálogo de categoria (criar ou renomear): só o nome. O limite do contrato aparece no campo (`aria-invalid`); a
 * recusa da API (ex.: nome repetido, `CATEGORY_NAME_TAKEN`) aparece no aviso do próprio diálogo. Gravar exige rede.
 */
export function CategoryDialog({
  category,
  onClose,
}: {
  /** A categoria em renomeação; ausente para criar uma nova. */
  category?: ShopCategory;
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [error, setError] = useState<string | undefined>();
  const createMutation = useCreateShopCategory();
  const renameMutation = useRenameShopCategory();
  const mutation = category ? renameMutation : createMutation;

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = createShopCategoryRequestSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Nome inválido.");
      return;
    }
    setError(undefined);
    if (category) {
      renameMutation.mutate({ id: category.id, name: parsed.data.name }, { onSuccess: onClose });
    } else {
      createMutation.mutate(parsed.data.name, { onSuccess: onClose });
    }
  }

  return (
    <Dialog title={category ? "Renomear categoria" : "Nova categoria"} onClose={onClose}>
      <form onSubmit={submit} noValidate aria-label="Categoria" className="fb-ui-dialog__form">
        <Field
          label="Nome"
          placeholder="Ex.: Vestuário"
          value={name}
          error={error}
          onChange={(event) => setName(event.target.value)}
        />
        {mutation.isError && (
          <Alert>{errorMessage(mutation.error, "Não foi possível salvar a categoria.")}</Alert>
        )}
        <div className="fb-ui-dialog__actions">
          <Button disabled={mutation.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <RequiresNetwork>
            <Button type="submit" variant="primary" busy={mutation.isPending}>
              Salvar
            </Button>
          </RequiresNetwork>
        </div>
      </form>
    </Dialog>
  );
}
