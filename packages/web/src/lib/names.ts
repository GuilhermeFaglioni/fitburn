/**
 * Nomes de pessoas: um único lugar para "primeiro nome" (o design mostra o professor como "Prof. Rafael").
 */

/** "Rafael Andrade" -> "Rafael". */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * O primeiro nome, a não ser que outra pessoa do conjunto exibido tenha o mesmo primeiro nome (nomes completos
 * diferentes): nesse caso o nome completo, para os dois não ficarem idênticos.
 *
 * @param peers nomes completos das pessoas mostradas juntas (pode incluir o próprio; repetições do mesmo nome não contam).
 */
export function shortName(fullName: string, peers: readonly string[] = []): string {
  const first = firstName(fullName);
  const full = fullName.trim().replace(/\s+/g, " ");
  const collides = peers.some((peer) => {
    const other = peer.trim().replace(/\s+/g, " ");
    return other !== full && firstName(other) === first;
  });
  return collides ? full : first;
}

/** "Prof. Rafael" (ou "Prof. Rafael Andrade" se houver outro Rafael entre `peers`). */
export function professorLabel(fullName: string, peers: readonly string[] = []): string {
  return `Prof. ${shortName(fullName, peers)}`;
}
