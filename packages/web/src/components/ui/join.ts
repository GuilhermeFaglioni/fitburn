/** Junta nomes de classe ignorando os vazios. */
export function join(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
