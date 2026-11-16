/** Converte *trecho* em <em>trecho</em>. Só para texto próprio de copy.ts (nunca entrada externa). */
export function emphasis(text: string): string {
  return text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
