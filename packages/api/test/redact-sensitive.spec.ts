import { redactSensitive } from "../src/common/logging/redact-sensitive.js";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLXNlY3JldA";
const REFRESH = "9f8e7d6c5b4a39281706f5e4d3c2b1a0";

describe("redactSensitive: cabeçalhos de autenticação", () => {
  it("mascara o esquema e o token de Authorization: Bearer", () => {
    const output = redactSensitive(`request failed. Authorization: Bearer ${JWT}\nnext line`);

    expect(output).not.toContain(JWT);
    expect(output).not.toContain("Bearer");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("next line");
  });

  it("mascara Authorization em JSON, entre aspas", () => {
    const output = redactSensitive(JSON.stringify({ headers: { authorization: `Bearer ${JWT}` } }));

    expect(output).not.toContain(JWT);
  });

  it("mascara um Bearer token solto no texto", () => {
    const output = redactSensitive(`unexpected header value Bearer ${JWT}, retry`);

    expect(output).not.toContain(JWT);
  });

  it("mascara o valor inteiro de Cookie, inclusive o cookie de refresh", () => {
    const output = redactSensitive(
      `headers: Cookie: theme=dark; fitburn_refresh_token=${REFRESH}; other=1\nnext line`,
    );

    expect(output).not.toContain(REFRESH);
    expect(output).not.toContain("theme=dark");
    expect(output).toContain("next line");
  });

  it("mascara Set-Cookie de refresh, com atributos", () => {
    const output = redactSensitive(
      `Set-Cookie: fitburn_refresh_token=${REFRESH}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax`,
    );

    expect(output).not.toContain(REFRESH);
  });

  it("mascara o cookie de refresh mesmo fora de um cabeçalho", () => {
    const output = redactSensitive(`cookie jar { fitburn_refresh_token=${REFRESH} }`);

    expect(output).not.toContain(REFRESH);
  });

  it("continua mascarando senhas e hashes, sem tocar em texto comum", () => {
    expect(redactSensitive('password: "abc123"')).not.toContain("abc123");
    expect(redactSensitive("erro ao salvar o usuário 42")).toBe("erro ao salvar o usuário 42");
  });
});
