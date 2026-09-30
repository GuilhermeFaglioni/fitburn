/**
 * Opção de professor nos selects administrativos: sempre o nome COMPLETO (quem ensina escolhe entre pessoas, e dois
 * professores com o mesmo primeiro nome não podem ficar idênticos). O primeiro nome só aparece nos textos voltados
 * ao cliente e nos chips do design ("Prof. Rafael"), ver `lib/names.ts`.
 */
export function instructorOptionLabel(fullName: string, isTitular: boolean): string {
  const label = `Prof. ${fullName.trim()}`;
  return isTitular ? `${label} (titular)` : label;
}
