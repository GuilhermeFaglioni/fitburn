import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { Switch } from "../../components/ui/Switch";
import { Table, type TableColumn } from "../../components/ui/Table";
import {
  DEFAULT_VARIANT_DRAFT,
  type VariantDraft,
  type VariantDrafts,
  type VariantRow,
  type VariationErrors,
} from "./productForm";

/** Linhas visíveis com a tabela recolhida (até 8000 combinações: 20 valores em 3 opções). */
export const COLLAPSED_VARIANT_ROWS = 5;

interface VariantsTableProps {
  rows: VariantRow[];
  drafts: VariantDrafts;
  errors: VariationErrors;
  disabled: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onChange: (key: string, patch: Partial<VariantDraft>) => void;
}

/**
 * Seção "Variações e estoque" (L2, #190): uma linha por combinação das opções, com estoque, preço próprio (vazio usa
 * o preço do produto) e interruptor "ativa". Recolhida mostra as primeiras linhas e "Mostrando X de N".
 */
export function VariantsTable({
  rows,
  drafts,
  errors,
  disabled,
  expanded,
  onExpandedChange,
  onChange,
}: VariantsTableProps) {
  const total = rows.length;
  const collapsible = total > COLLAPSED_VARIANT_ROWS;
  const showAll = expanded || !collapsible;
  const visible = showAll ? rows : rows.slice(0, COLLAPSED_VARIANT_ROWS);
  const draftOf = (key: string): VariantDraft => drafts[key] ?? DEFAULT_VARIANT_DRAFT;

  const columns: TableColumn<VariantRow>[] = [
    {
      key: "variacao",
      header: "Variação",
      cell: (row) => (
        <span className={draftOf(row.key).ativa ? undefined : "fb-shop-soft"}>{row.label}</span>
      ),
    },
    {
      key: "estoque",
      header: "Estoque",
      cell: (row) => (
        <Field
          hideLabel
          label={`Estoque ${row.label}`}
          inputMode="numeric"
          value={draftOf(row.key).stock}
          error={errors.variantRows[row.key]?.stock}
          disabled={disabled}
          onChange={(event) => onChange(row.key, { stock: event.target.value })}
        />
      ),
    },
    {
      key: "preco",
      header: "Preço próprio",
      cell: (row) => (
        <Field
          hideLabel
          label={`Preço ${row.label}`}
          inputMode="decimal"
          placeholder="—"
          value={draftOf(row.key).price}
          error={errors.variantRows[row.key]?.price}
          disabled={disabled}
          onChange={(event) => onChange(row.key, { price: event.target.value })}
        />
      ),
    },
    {
      key: "ativa",
      header: "Ativa",
      cell: (row) => (
        <Switch
          hideLabel
          label={`${row.label} ativa`}
          checked={draftOf(row.key).ativa}
          disabled={disabled}
          onChange={(checked) => onChange(row.key, { ativa: checked })}
        />
      ),
    },
  ];

  return (
    <Card as="section" aria-labelledby="shop-product-variants" className="fb-ui-card--form">
      <h2 id="shop-product-variants" className="fb-ui-section-title">
        Variações e estoque{" "}
        <span className="fb-shop-soft fb-shop-section-count">
          · {total} {total === 1 ? "combinação" : "combinações"}
        </span>
      </h2>
      <div className="fb-shop-card-body fb-ui-stack">
        <Table
          className="fb-shop-variants"
          label="Variações e estoque"
          columns={columns}
          rows={visible}
          rowKey={(row) => row.key}
        />
        <p className="fb-ui-note">
          Mostrando {visible.length} de {total}. Preço próprio vazio usa o preço do produto. O preço
          promocional vale para todas as variações sem preço próprio. Variação desligada não aparece
          para o cliente.
        </p>
        {collapsible && (
          <div>
            <Button size="sm" onClick={() => onExpandedChange(!expanded)}>
              {expanded ? "Mostrar menos" : `Mostrar todas as ${total}`}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
