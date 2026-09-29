/** Duck typing: com o driver adapter, `instanceof` nos erros do Prisma não é confiável. */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}
