const MASK = "[REDACTED]";

// Hash argon2 (o que guardamos em User.passwordHash), inclusive com parâmetros e salt.
const ARGON2_HASH = /\$argon2[a-z]*\$[^\s"'`,}]+/gi;

// Pares chave/valor sensíveis em texto livre ou JSON: password: "x", "newPassword":"x", token=x.
const SENSITIVE_PAIR =
  /(["']?\b(?:password|passwordHash|newPassword|currentPassword|token|accessToken|refreshToken|authorization)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|`[^`]*`|[^\s,;}&]+)/gi;

/**
 * Última barreira antes de gravar qualquer mensagem de erro no log: mensagens
 * de bibliotecas (Prisma, drivers) às vezes ecoam os dados da operação que falhou.
 */
export function redactSensitive(text: string): string {
  return text.replace(ARGON2_HASH, MASK).replace(SENSITIVE_PAIR, `$1${MASK}`);
}
