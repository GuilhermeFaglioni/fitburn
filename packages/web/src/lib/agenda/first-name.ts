/** "Rafael Andrade" -> "Rafael": o design mostra o professor pelo primeiro nome ("Prof. Rafael"). */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
