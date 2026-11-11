import {
  ErrorCode,
  ErrorStatus,
  normalizeOptionText,
  shopVariantCombinations,
  shopVariantLabel,
  type ProductOptionsInput,
  type ShopVariantOverride,
} from "@fitburn/contracts";
import { DomainError } from "../common/errors/domain-error.js";

/** Uma variação que o produto deve ter depois de gravar as opções. */
export interface VariantPlan {
  /** Identidade estável: pares opção/valor normalizados e ordenados pelo nome da opção; "" sem opções. */
  key: string;
  label: string | null;
  /** Valores de exibição, na ordem das opções enviadas. */
  values: string[];
  position: number;
  /** Sobreposição enviada para esta combinação (estoque, preço próprio, ativa), se houver. */
  override: ShopVariantOverride | undefined;
}

/** Chave de identidade de uma combinação. Sem opções, "" (variação única da L1). */
export function combinationKeyOf(optionNames: string[], values: string[]): string {
  if (optionNames.length === 0) return "";
  const pairs = optionNames.map(
    (name, index) =>
      [normalizeOptionText(name), normalizeOptionText(values[index] ?? "")] as [string, string],
  );
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(pairs);
}

/**
 * Plano das variações do produto: o produto cartesiano das opções, com as
 * sobreposições aplicadas. Sobreposição de combinação que não existe é erro (400).
 */
export function planVariants(
  options: ProductOptionsInput,
  overrides: ShopVariantOverride[] = [],
): VariantPlan[] {
  const names = options.map((option) => option.name);
  const plans: VariantPlan[] = shopVariantCombinations(
    options.map((option) => option.values),
  ).map((values, position) => ({
    key: combinationKeyOf(names, values),
    label: shopVariantLabel(values),
    values,
    position,
    override: undefined,
  }));

  const byKey = new Map(plans.map((plan) => [plan.key, plan]));
  for (const override of overrides) {
    const plan = byKey.get(combinationKeyOf(names, override.combination));
    if (!plan) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        "Combinação não existe neste produto.",
        ErrorStatus.VALIDATION,
      );
    }
    plan.override = override;
  }
  return plans;
}

/**
 * Valores de exibição de uma variação, na ordem das opções atuais, a partir da chave.
 * Vazio para a variação única. Usado para a tela (a chave guarda só o normalizado).
 */
export function valuesOfVariant(
  key: string,
  options: { name: string; values: { value: string }[] }[],
): string[] {
  if (key === "") return [];
  const pairs = new Map<string, string>(JSON.parse(key) as [string, string][]);
  return options.map((option) => {
    const valueKey = pairs.get(normalizeOptionText(option.name));
    return option.values.find((value) => normalizeOptionText(value.value) === valueKey)?.value ?? "";
  });
}
