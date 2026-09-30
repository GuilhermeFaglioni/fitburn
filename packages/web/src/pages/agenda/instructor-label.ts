/** "Prof. Rafael (titular)" para o professor padrão do template; os demais só com o primeiro nome. */
export function instructorOptionLabel(fullName: string, isTitular: boolean): string {
  const first = fullName.split(" ")[0];
  return isTitular ? `Prof. ${first} (titular)` : `Prof. ${first}`;
}
