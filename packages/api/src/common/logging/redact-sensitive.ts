const MASK = "[REDACTED]";

// Hash argon2 (o que guardamos em User.passwordHash), inclusive com parâmetros e salt.
const ARGON2_HASH = /\$argon2[a-z]*\$[^\s"'`,}]+/gi;

// Pares chave/valor sensíveis em texto livre ou JSON: password: "x", "newPassword":"x", token=x.
const SENSITIVE_PAIR =
  /(["']?\b(?:password|passwordHash|newPassword|currentPassword|token|accessToken|refreshToken)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|`[^`]*`|[^\s,;}&]+)/gi;

// Cabeçalhos de credencial: o valor INTEIRO (esquema + token, todos os cookies e atributos) até o
// fim da linha, ou o valor entre aspas quando vem em JSON.
const CREDENTIAL_HEADER =
  /(["']?\b(?:proxy-authorization|authorization|set-cookie|cookie)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\r\n]+)/gi;

// "Bearer <token>" solto no texto, fora de um cabeçalho reconhecível.
const BEARER_TOKEN = /\bBearer\s+[\w.~+/=-]+/gi;

// Cookie de refresh (fitburn_refresh_token=...) mesmo fora de um cabeçalho.
const REFRESH_COOKIE_PAIR = /(\b\w*refresh_?token\w*\s*=\s*)[^\s;,}"']+/gi;

/**
 * Última barreira antes de gravar qualquer mensagem de erro no log: mensagens
 * de bibliotecas (Prisma, drivers) às vezes ecoam os dados da operação que falhou.
 */
export function redactSensitive(text: string): string {
  return text
    .replace(ARGON2_HASH, MASK)
    .replace(CREDENTIAL_HEADER, `$1${MASK}`)
    .replace(BEARER_TOKEN, MASK)
    .replace(REFRESH_COOKIE_PAIR, `$1${MASK}`)
    .replace(SENSITIVE_PAIR, `$1${MASK}`);
}
