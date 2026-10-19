const MASK = "[REDACTED]";

// Hash argon2 (o que guardamos em User.passwordHash), inclusive com parâmetros e salt.
const ARGON2_HASH = /\$argon2[a-z]*\$[^\s"'`,}]+/gi;

const SENSITIVE_FIELD_PATTERN = [
  "password",
  "passwordHash",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "proxy-authorization",
  "set-cookie",
  "cookie",
  "email",
  "fullName",
  "name",
  "document",
  "cpf",
  "phone",
  "phoneNumber",
  "telephone",
  "address",
  "birthDate",
  "birth_date",
  "dateOfBirth",
  "date_of_birth",
  "title",
  "description",
  "notes",
  "sets",
  "reps",
  "load",
  "duration",
  "distance",
].join("|");

// Pares chave/valor sensíveis em texto livre ou JSON: password: "x", "newPassword":"x", token=x.
const SENSITIVE_PAIR = new RegExp(
  String.raw`(["']?\b(?:${SENSITIVE_FIELD_PATTERN})["']?\s*[:=]\s*)("[^"]*"|'[^']*'|\`[^\`]*\`|[^\s,;}&]+)`,
  "gi",
);

// Cabeçalhos de credencial: o valor INTEIRO (esquema + token, todos os cookies e atributos) até o
// fim da linha, ou o valor entre aspas quando vem em JSON.
const CREDENTIAL_HEADER =
  /(["']?\b(?:proxy-authorization|authorization|set-cookie|cookie)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\r\n]+)/gi;

// "Bearer <token>" solto no texto, fora de um cabeçalho reconhecível.
const BEARER_TOKEN = /\bBearer\s+[\w.~+/=-]+/gi;

// Cookie de refresh (fitburn_refresh_token=...) mesmo fora de um cabeçalho.
const REFRESH_COOKIE_PAIR = /(\b\w*refresh_?token\w*\s*=\s*)[^\s;,}"']+/gi;

const SENSITIVE_FIELD_NAME = new RegExp(`^(?:${SENSITIVE_FIELD_PATTERN})$`, "i");
const SENSITIVE_CONTAINER_FIELD_NAME =
  /^(?:goal|goals|exercise|exercises|workoutSheet|workoutSheets|workoutExercise|workoutExercises)$/i;

/**
 * Última barreira antes de gravar dados estruturados ou mensagens de erro no log:
 * mensagens de bibliotecas (Prisma, drivers) podem ecoar os dados da operação.
 */
export function redactSensitive(text: string): string;
export function redactSensitive(value: unknown): unknown;
export function redactSensitive(value: unknown): unknown {
  return redactValue(value, new WeakMap());
}

export function serializeRedactedLogEntry(entry: Record<string, unknown>): string {
  return JSON.stringify(redactSensitive(entry)) ?? "{}";
}

function redactValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (value instanceof Error) {
    return redactText(value.stack ?? `${value.name}: ${value.message}`);
  }
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const redacted: unknown[] = [];
    seen.set(value, redacted);
    for (const item of value) redacted.push(redactValue(item, seen));
    return redacted;
  }

  const redacted: Record<string, unknown> = {};
  seen.set(value, redacted);
  for (const [key, nestedValue] of Object.entries(value)) {
    const hasNestedRecord = nestedValue !== null && typeof nestedValue === "object";
    redacted[key] = SENSITIVE_FIELD_NAME.test(key) &&
      !(hasNestedRecord && SENSITIVE_CONTAINER_FIELD_NAME.test(key))
      ? MASK
      : redactValue(nestedValue, seen);
  }
  return redacted;
}

function redactText(text: string): string {
  return text
    .replace(ARGON2_HASH, MASK)
    .replace(CREDENTIAL_HEADER, `$1${MASK}`)
    .replace(BEARER_TOKEN, MASK)
    .replace(REFRESH_COOKIE_PAIR, `$1${MASK}`)
    .replace(SENSITIVE_PAIR, `$1${MASK}`);
}
