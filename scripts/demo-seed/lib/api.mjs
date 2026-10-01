/**
 * Cliente HTTP mínimo da API do Fitburn (fetch nativo do Node 20+).
 *
 * `session(email, senha)` faz login sob demanda e refaz o login se o token
 * expirar no meio da execução (o access token dura 15 minutos por padrão).
 */
import { randomUUID } from "node:crypto";

export class ApiError extends Error {
  constructor(method, path, status, body) {
    const code = body && typeof body === "object" ? body.code : undefined;
    const message = body && typeof body === "object" ? body.message : String(body ?? "");
    super(`${method} ${path} -> ${status}${code ? ` ${code}` : ""}: ${message}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = body && typeof body === "object" ? body.details : undefined;
  }
}

export function createApi(baseUrl) {
  async function request(method, path, { token, body, headers } = {}) {
    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new Error(
        `Sem resposta de ${baseUrl} (${method} ${path}): ${error.message}. A API está rodando?`,
        { cause: error },
      );
    }
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!res.ok) throw new ApiError(method, path, res.status, json);
    return json;
  }

  /** Uma conta autenticada: `call(método, caminho, { body, headers })`. */
  function session(email, password) {
    let token = null;
    const login = async () => {
      const result = await request("POST", "/auth/login", { body: { email, password } });
      token = result.accessToken;
      return result;
    };
    return {
      email,
      login,
      async call(method, path, options = {}) {
        if (!token) await login();
        try {
          return await request(method, path, { ...options, token });
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) throw error;
          await login();
          return request(method, path, { ...options, token });
        }
      },
    };
  }

  return { request, session };
}

/** Header de idempotência exigido pelas reservas: uma chave nova por tentativa. */
export const idempotency = () => ({ "Idempotency-Key": randomUUID() });
