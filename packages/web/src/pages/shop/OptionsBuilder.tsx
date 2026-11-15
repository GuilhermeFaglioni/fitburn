import { useId, type KeyboardEvent } from "react";
import { MAX_OPTION_VALUES, MAX_PRODUCT_OPTIONS, normalizeOptionText } from "@fitburn/contracts";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { newOption, type OptionDraft, type VariationErrors } from "./productForm";

interface OptionsBuilderProps {
  options: OptionDraft[];
  errors: VariationErrors;
  disabled: boolean;
  onChange: (options: OptionDraft[]) => void;
}

/**
 * Seção "Opções" do cadastro de produto (L2, #190): até 3 opções livres (Cor, Tamanho, Modelo…), cada uma com o
 * nome e os valores em chips (Enter adiciona, × remove, até 20). Quem mexe nas opções mexe no produto cartesiano da
 * tabela "Variações e estoque", que fica no formulário.
 */
export function OptionsBuilder({ options, errors, disabled, onChange }: OptionsBuilderProps) {
  const atLimit = options.length >= MAX_PRODUCT_OPTIONS;

  function update(key: string, patch: Partial<OptionDraft>) {
    onChange(options.map((option) => (option.key === key ? { ...option, ...patch } : option)));
  }

  return (
    <Card as="section" aria-labelledby="shop-product-options" className="fb-ui-card--form">
      <h2 id="shop-product-options" className="fb-ui-section-title">
        Opções
      </h2>
      <div className="fb-shop-builder fb-shop-card-body">
        {options.map((option) => (
          <OptionRow
            key={option.key}
            option={option}
            errors={errors.optionFields[option.key]}
            disabled={disabled}
            onUpdate={(patch) => update(option.key, patch)}
            onRemove={() => onChange(options.filter((item) => item.key !== option.key))}
          />
        ))}
        {errors.options && (
          <span role="alert" className="fb-ui-help fb-ui-help--err">
            {errors.options}
          </span>
        )}
        <div className="fb-shop-builder__add">
          <Button
            size="sm"
            variant="soft"
            disabled={disabled || atLimit}
            onClick={() => onChange([...options, newOption()])}
          >
            + Adicionar opção
          </Button>
          {atLimit && (
            <span className="fb-ui-help">Máximo de {MAX_PRODUCT_OPTIONS} opções por produto.</span>
          )}
        </div>
      </div>
    </Card>
  );
}

interface OptionRowProps {
  option: OptionDraft;
  errors?: { name?: string; values?: string };
  disabled: boolean;
  onUpdate: (patch: Partial<OptionDraft>) => void;
  onRemove: () => void;
}

function OptionRow({ option, errors, disabled, onUpdate, onRemove }: OptionRowProps) {
  const labelId = useId();
  const name = option.name.trim();
  const full = option.values.length >= MAX_OPTION_VALUES;
  const valuesError = errors?.values ?? (option.draftError || undefined);

  function addValue() {
    const value = option.draft.trim();
    if (value === "") return;
    if (
      option.values.some((existing) => normalizeOptionText(existing) === normalizeOptionText(value))
    ) {
      onUpdate({ draftError: "Esse valor já está nesta opção." });
      return;
    }
    onUpdate({ values: [...option.values, value], draft: "", draftError: "" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adiciona o valor; não deixa o formulário do produto ser enviado.
    if (event.key !== "Enter") return;
    event.preventDefault();
    addValue();
  }

  return (
    <div className="fb-shop-builder__row">
      <Field
        label="Nome da opção"
        value={option.name}
        error={errors?.name}
        disabled={disabled}
        onChange={(event) => onUpdate({ name: event.target.value })}
      />
      <div className="fb-ui-field" role="group" aria-labelledby={labelId}>
        <span id={labelId} className="fb-ui-field__label">
          Valores
        </span>
        <div className="fb-shop-tokens">
          {option.values.map((value) => (
            <span key={value} className="fb-shop-token">
              {value}
              <button
                type="button"
                className="fb-shop-token__remove"
                aria-label={`Remover ${value}`}
                disabled={disabled}
                onClick={() => onUpdate({ values: option.values.filter((item) => item !== value) })}
              >
                ×
              </button>
            </span>
          ))}
          <Field
            className="fb-shop-tokens__input"
            hideLabel
            label={`Novo valor de ${name || "opção"}`}
            placeholder="Novo valor + Enter"
            value={option.draft}
            disabled={disabled || full}
            onChange={(event) => onUpdate({ draft: event.target.value, draftError: "" })}
            onKeyDown={onKeyDown}
          />
        </div>
        {full && (
          <span className="fb-ui-help">Máximo de {MAX_OPTION_VALUES} valores por opção.</span>
        )}
        {valuesError && (
          <span role="alert" className="fb-ui-help fb-ui-help--err">
            {valuesError}
          </span>
        )}
      </div>
      <Button
        size="sm"
        variant="ghost-danger"
        className="fb-shop-builder__remove"
        disabled={disabled}
        aria-label={name ? `Remover opção ${name}` : "Remover opção"}
        onClick={onRemove}
      >
        Remover
      </Button>
    </div>
  );
}
