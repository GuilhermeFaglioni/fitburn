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

  it("mascara campos pessoais em mensagens de log", () => {
    const output = redactSensitive(
      'email: "ana@example.com", document: "123.456.789-00", phone: "+55 11 99999-0000", address: "Rua A, 10", birthDate: "2000-01-01", description: "meta pessoal"',
    );

    for (const value of [
      "ana@example.com",
      "123.456.789-00",
      "+55 11 99999-0000",
      "Rua A, 10",
      "2000-01-01",
      "meta pessoal",
    ]) {
      expect(output).not.toContain(value);
    }
  });

  it("mascara campos pessoais em objetos aninhados", () => {
    const output = redactSensitive({
      request: {
        user: {
          email: "ana@example.com",
          document: "123.456.789-00",
          phone: "+55 11 99999-0000",
          address: "Rua A, 10",
          birthDate: "2000-01-01",
        },
        goals: [{ title: "correr 10 km", description: "meta pessoal" }],
        workoutSheet: {
          title: "treino da Ana",
          notes: "treino com dado de saúde",
          exercises: [
            {
              name: "agachamento",
              sets: "4 séries",
              reps: "8 repetições",
              load: "40 kg",
              duration: "45 segundos",
              distance: "500 metros",
              notes: "dor no joelho",
            },
          ],
        },
      },
    });

    expect(output).toEqual({
      request: {
        user: {
          email: "[REDACTED]",
          document: "[REDACTED]",
          phone: "[REDACTED]",
          address: "[REDACTED]",
          birthDate: "[REDACTED]",
        },
        goals: [{ title: "[REDACTED]", description: "[REDACTED]" }],
        workoutSheet: {
          title: "[REDACTED]",
          notes: "[REDACTED]",
          exercises: [
            {
              name: "[REDACTED]",
              sets: "[REDACTED]",
              reps: "[REDACTED]",
              load: "[REDACTED]",
              duration: "[REDACTED]",
              distance: "[REDACTED]",
              notes: "[REDACTED]",
            },
          ],
        },
      },
    });
  });

  it("continua mascarando credenciais em objetos estruturados", () => {
    const output = redactSensitive({
      credentials: {
        authorization: `Bearer ${JWT}`,
        cookie: `fitburn_refresh_token=${REFRESH}`,
        password: "senha-temporaria",
      },
    });

    expect(output).toEqual({
      credentials: {
        authorization: "[REDACTED]",
        cookie: "[REDACTED]",
        password: "[REDACTED]",
      },
    });
  });

  it("mascara dados pessoais em mensagens Prisma multilinha", () => {
    const output = redactSensitive(
      `PrismaClientKnownRequestError: Invalid prisma.user.create() invocation:\n{\n  data: {\n    email: "ana@example.com",\n    document: "123.456.789-00",\n    description: "meta na primeira linha\ne lesão na segunda"\n  }\n}`,
    );

    for (const value of [
      "ana@example.com",
      "123.456.789-00",
      "meta na primeira linha",
      "lesão na segunda",
    ]) {
      expect(output).not.toContain(value);
    }
  });

  it("mascara e-mail e CPF soltos no texto, fora de um par chave/valor", () => {
    const output = redactSensitive(
      "Unique constraint failed: ana.souza+fit@example.com.br já existe (CPF 12345678900 e 123.456.789-00)",
    );

    for (const value of ["ana.souza+fit@example.com.br", "12345678900", "123.456.789-00"]) {
      expect(output).not.toContain(value);
    }
    expect(output).toContain("Unique constraint failed");
  });
});
