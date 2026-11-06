import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { gymDateTimeToUtc } from "@fitburn/contracts";
import request from "supertest";
import { asBinary, hasUtf8Bom, parseCsv } from "./csv-test-utils.js";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import {
  createAccessProfile,
  createOccurrence,
  createReservation,
  createUser,
  grantModuleAccess,
} from "./factories.js";
import { loginAndGetAccessToken } from "./login-helper.js";
import { createTestApp } from "./test-app.js";

const PASSWORD = "SenhaForte123!";
const DAY = "2026-10-05";
const HOUR_MS = 60 * 60_000;
/** Cabeçalho literal (não importado do contrato): o teste confere o texto final. */
const HEADER = [
  "ocorrencia_id",
  "aula",
  "data_local",
  "hora_local",
  "situacao",
  "capacidade",
  "vagas_ocupadas",
  "vagas_disponiveis",
  "ocupacao_percentual",
];

/** Instante UTC de um horário local da academia (America/Sao_Paulo). */
function at(date: string, time: string): Date {
  return gymDateTimeToUtc(date, time);
}

describe("Exportação de ocupação por período (HTTP)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  function get(url: string, token?: string) {
    const test = request(app.getHttpServer()).get(url);
    return token ? test.set("Authorization", `Bearer ${token}`) : test;
  }

  function exportUrl(from: string, to: string): string {
    return `/api/exports/occupancy?from=${from}&to=${to}`;
  }

  /** Baixa o CSV e devolve status, bytes, texto e linhas já parseadas. */
  async function downloadCsv(token: string, from: string, to: string) {
    const response = await asBinary(get(exportUrl(from, to), token));
    const bytes = response.body as Buffer;
    const text = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : "";
    return {
      response,
      bytes,
      text,
      rows: Buffer.isBuffer(bytes) ? parseCsv(text) : [],
    };
  }

  /** Linha do CSV pelo ID da ocorrência (a primeira coluna). */
  function rowOf(rows: string[][], occurrenceId: string): string[] {
    const row = rows.find((cells) => cells[0] === occurrenceId);
    if (!row) throw new Error(`Ocorrência ${occurrenceId} não está no CSV.`);
    return row;
  }

  async function loginAsAdmin(): Promise<string> {
    const profile = await createAccessProfile({ name: "Administrador", isSystem: true });
    const user = await createUser({
      email: "admin@fitburn.local",
      password: PASSWORD,
      profileId: profile.id,
    });
    return loginAndGetAccessToken(app, user.email, PASSWORD);
  }

  async function createStaff(email: string, fullName: string) {
    const profile = await createAccessProfile({ name: `Perfil ${email}` });
    return createUser({ email, password: PASSWORD, profileId: profile.id, fullName });
  }

  /** Membro da equipe com acesso a OCORRENCIAS:VIEW no escopo dado (ou sem esse acesso, se `scope` for null). */
  async function staffWithScope(
    email: string,
    scope: "ALL" | "OWN" | "ASSIGNED_CLASSES" | "ASSIGNED_CLIENTS" | null,
  ) {
    const profile = await createAccessProfile({ name: `Perfil ${email}` });
    if (scope) {
      await grantModuleAccess({
        profileId: profile.id,
        module: "OCORRENCIAS",
        actions: ["VIEW"],
        scope,
      });
    } else {
      await grantModuleAccess({
        profileId: profile.id,
        module: "USUARIOS",
        actions: ["VIEW"],
        scope: "ALL",
      });
    }
    const user = await createUser({ email, password: PASSWORD, profileId: profile.id, fullName: "Equipe Fictícia" });
    const token = await loginAndGetAccessToken(app, user.email, PASSWORD);
    return { user, token };
  }

  async function createClients(count: number) {
    const profile = await createAccessProfile({ name: "Cliente", isSystem: true });
    return Promise.all(
      Array.from({ length: count }, (_, index) =>
        createUser({
          email: `cliente${index}@fitburn.local`,
          password: PASSWORD,
          profileId: profile.id,
          fullName: `Cliente Fictício ${index}`,
        }),
      ),
    );
  }

  describe("Formato do download", () => {
    it("responde CSV UTF-8 com BOM, ';', CRLF e cabeçalho de download", async () => {
      const token = await loginAsAdmin();
      await createOccurrence(at(DAY, "18:00"));

      const { response, bytes, text, rows } = await downloadCsv(token, DAY, DAY);

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
      expect(response.headers["content-disposition"]).toBe(
        `attachment; filename="ocupacao_${DAY}_${DAY}.csv"`,
      );
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(hasUtf8Bom(bytes)).toBe(true);
      expect(text.endsWith("\r\n")).toBe(true);
      // Todo quebra de linha é CRLF: nenhum LF ou CR solto.
      expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
      expect(text.slice(1).split("\r\n")[0]).toBe(HEADER.join(";"));
      expect(rows).toHaveLength(2);
    });

    it("traz os cabeçalhos exatos, nesta ordem", async () => {
      const token = await loginAsAdmin();

      const { rows } = await downloadCsv(token, DAY, DAY);

      expect(rows[0]).toEqual(HEADER);
    });

    it("sem nenhuma ocorrência no período, devolve só o cabeçalho", async () => {
      const token = await loginAsAdmin();
      await createOccurrence(at("2026-09-01", "18:00"));

      const { response, rows } = await downloadCsv(token, DAY, DAY);

      expect(response.status).toBe(200);
      expect(rows).toEqual([HEADER]);
    });
  });

  describe("Cálculo da ocupação", () => {
    it("aula sem reservas aparece com 0 ocupadas, tudo disponível e 0%", async () => {
      const token = await loginAsAdmin();
      const occurrence = await createOccurrence(at(DAY, "18:00"));

      const { rows } = await downloadCsv(token, DAY, DAY);

      expect(rowOf(rows, occurrence.id)).toEqual([
        occurrence.id,
        "Treino Funcional",
        DAY,
        "18:00",
        "AGENDADA",
        "12",
        "0",
        "12",
        "0",
      ]);
    });

    it("CANCELLED não ocupa vaga; CONFIRMED, COMPLETED e NO_SHOW ocupam; percentual com vírgula", async () => {
      const token = await loginAsAdmin();
      const clients = await createClients(7);
      // Capacidade 12: 3 ocupadas (CONFIRMED, COMPLETED, NO_SHOW) e 2 canceladas.
      const occurrence = await createOccurrence(at(DAY, "18:00"));
      await createReservation(clients[0].id, occurrence.id, "CONFIRMED");
      await createReservation(clients[1].id, occurrence.id, "COMPLETED");
      await createReservation(clients[2].id, occurrence.id, "NO_SHOW");
      await createReservation(clients[3].id, occurrence.id, "CANCELLED");
      await createReservation(clients[4].id, occurrence.id, "CANCELLED");
      // Capacidade 8 com 7 confirmadas: 87,5%.
      const full = await createOccurrence(at(DAY, "19:00"));
      await testPrisma.classOccurrence.update({ where: { id: full.id }, data: { capacity: 8 } });
      for (const client of clients) {
        await createReservation(client.id, full.id, "CONFIRMED");
      }

      const { rows } = await downloadCsv(token, DAY, DAY);

      expect(rowOf(rows, occurrence.id).slice(5)).toEqual(["12", "3", "9", "25"]);
      expect(rowOf(rows, full.id).slice(5)).toEqual(["8", "7", "1", "87,5"]);
    });

    it("capacidade zero não gera erro e deixa o percentual vazio, com ou sem reservas", async () => {
      const token = await loginAsAdmin();
      const clients = await createClients(2);
      const empty = await createOccurrence(at(DAY, "08:00"));
      const booked = await createOccurrence(at(DAY, "09:00"));
      await testPrisma.classOccurrence.update({ where: { id: empty.id }, data: { capacity: 0 } });
      await testPrisma.classOccurrence.update({ where: { id: booked.id }, data: { capacity: 0 } });
      await createReservation(clients[0].id, booked.id, "CONFIRMED");
      await createReservation(clients[1].id, booked.id, "COMPLETED");

      const { response, rows } = await downloadCsv(token, DAY, DAY);

      expect(response.status).toBe(200);
      expect(rowOf(rows, empty.id).slice(5)).toEqual(["0", "0", "0", ""]);
      expect(rowOf(rows, booked.id).slice(5)).toEqual(["0", "2", "0", ""]);
    });

    it("ocorrência cancelada aparece com situacao CANCELADA", async () => {
      const token = await loginAsAdmin();
      const cancelled = await createOccurrence(at(DAY, "20:00"), { status: "CANCELLED" });

      const { rows } = await downloadCsv(token, DAY, DAY);

      expect(rowOf(rows, cancelled.id)[4]).toBe("CANCELADA");
      expect(rowOf(rows, cancelled.id).slice(6, 8)).toEqual(["0", "12"]);
    });
  });

  describe("Período por data local em America/Sao_Paulo", () => {
    it("inclui a aula de 23h30 do último dia e deixa de fora 00h00 do dia seguinte e 23h30 do dia anterior", async () => {
      const token = await loginAsAdmin();
      const instructor = await createStaff("rafael.ficticio@fitburn.local", "Rafael Fictício");
      // Sem professor, as aulas não se sobrepõem com as de outro professor (constraint de agenda).
      const dayStartInside = await createOccurrence(at(DAY, "00:00"));
      const lastDayLateInside = await createOccurrence(at(DAY, "23:30"));
      const nextDayStartOutside = await createOccurrence(at("2026-10-06", "00:00"), {
        instructorId: instructor.id,
      });
      const previousDayLateOutside = await createOccurrence(at("2026-10-04", "23:30"), {
        instructorId: instructor.id,
      });

      const { rows } = await downloadCsv(token, DAY, DAY);

      expect(rows.slice(1).map((cells) => cells[0])).toEqual([
        dayStartInside.id,
        lastDayLateInside.id,
      ]);
      expect(rowOf(rows, lastDayLateInside.id).slice(2, 4)).toEqual([DAY, "23:30"]);
      expect(rowOf(rows, dayStartInside.id).slice(2, 4)).toEqual([DAY, "00:00"]);
      expect(rows.some((cells) => cells[0] === nextDayStartOutside.id)).toBe(false);
      expect(rows.some((cells) => cells[0] === previousDayLateOutside.id)).toBe(false);
    });
  });

  describe("Escape e proteção contra fórmula", () => {
    it("nomes de aula perigosos chegam íntegros (texto prefixado com ' quando começa com fórmula)", async () => {
      const token = await loginAsAdmin();
      const cases: Array<[name: string, expectedCell: string]> = [
        ['=HYPERLINK("http://evil.example")', `'=HYPERLINK("http://evil.example")`],
        ["+SOMA(A1)", "'+SOMA(A1)"],
        ["-Yoga", "'-Yoga"],
        ["@admin", "'@admin"],
        ["\tTAB inicial", "'\tTAB inicial"],
        ["Aula;com ponto e vírgula", "Aula;com ponto e vírgula"],
        ['Aula "Forte"', 'Aula "Forte"'],
        ["Linha 1\nLinha 2", "Linha 1\nLinha 2"],
        ["Linha A\r\nLinha B", "Linha A\r\nLinha B"],
      ];
      const created = await Promise.all(
        cases.map(([name], index) =>
          createOccurrence(at(DAY, `${String(8 + index).padStart(2, "0")}:00`), { name }),
        ),
      );

      const { rows } = await downloadCsv(token, DAY, DAY);

      expect(rows).toHaveLength(cases.length + 1);
      cases.forEach(([, expectedCell], index) => {
        const row = rowOf(rows, created[index].id);
        // Nenhuma coluna deslocada: o nome é uma célula só, e a data continua no lugar.
        expect(row).toHaveLength(HEADER.length);
        expect(row[1]).toBe(expectedCell);
        expect(row[2]).toBe(DAY);
      });
    });
  });

  describe("Volume", () => {
    it("exporta mais de 1.000 ocorrências do período máximo, sem truncar", async () => {
      const token = await loginAsAdmin();
      const modality = await testPrisma.modality.create({ data: { name: "Modalidade em massa" } });
      const template = await testPrisma.classTemplate.create({
        data: { name: "Aula em massa", durationMinutes: 60, capacity: 12, modalityId: modality.id },
      });
      const start = at("2026-08-01", "00:00");
      // Uma aula por hora, sem sobreposição: 1.100 linhas dentro de 92 dias.
      const occurrences = Array.from({ length: 1100 }, (_, index) => {
        const startsAt = new Date(start.getTime() + index * HOUR_MS);
        return {
          id: randomUUID(),
          templateId: template.id,
          modalityId: modality.id,
          name: "Aula em massa",
          durationMinutes: 60,
          capacity: 12,
          status: "SCHEDULED" as const,
          startsAt,
          endsAt: new Date(startsAt.getTime() + HOUR_MS),
        };
      });
      await testPrisma.classOccurrence.createMany({ data: occurrences });

      const { response, rows } = await downloadCsv(token, "2026-08-01", "2026-10-31");

      expect(response.status).toBe(200);
      const dataRows = rows.slice(1);
      expect(dataRows).toHaveLength(1100);
      expect(new Set(dataRows.map((cells) => cells[0]))).toEqual(
        new Set(occurrences.map((occurrence) => occurrence.id)),
      );
    });
  });

  describe("Validação do período", () => {
    it("aceita exatamente 92 dias (inclusive)", async () => {
      const token = await loginAsAdmin();

      const { response } = await downloadCsv(token, "2026-08-01", "2026-10-31");

      expect(response.status).toBe(200);
    });

    it.each([
      [
        "data inicial posterior à final",
        "from=2026-10-10&to=2026-10-09",
        "A data inicial não pode ser posterior à data final.",
      ],
      [
        "93 dias",
        "from=2026-08-01&to=2026-11-01",
        "O período máximo da exportação é de 92 dias.",
      ],
    ])("%s → 400 VALIDATION_ERROR com mensagem explícita", async (_label, query, message) => {
      const token = await loginAsAdmin();

      const response = await get(`/api/exports/occupancy?${query}`, token);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "VALIDATION_ERROR", message });
    });

    it.each([
      ["data inexistente", "from=2026-02-31&to=2026-10-05", "from"],
      ["formato errado", "from=05/10/2026&to=2026-10-05", "from"],
      ["data final ausente", "from=2026-10-05", "to"],
    ])("%s → 400 VALIDATION_ERROR apontando o campo", async (_label, query, field) => {
      const token = await loginAsAdmin();

      const response = await get(`/api/exports/occupancy?${query}`, token);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_ERROR");
      expect(response.body.details.fieldErrors).toHaveProperty(field);
    });
  });

  describe("Autenticação e autorização", () => {
    it("sem token → 401", async () => {
      const response = await get(exportUrl(DAY, DAY));

      expect(response.status).toBe(401);
      expect(response.body.code).toBe("UNAUTHENTICATED");
    });

    it("sem a permissão OCORRENCIAS:VIEW → 403", async () => {
      const { token } = await staffWithScope("sem-acesso@fitburn.local", null);

      const response = await get(exportUrl(DAY, DAY), token);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
    });

    it("escopo que não enxerga aulas → 403", async () => {
      const { token } = await staffWithScope("sem-aulas@fitburn.local", "ASSIGNED_CLIENTS");

      const response = await get(exportUrl(DAY, DAY), token);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("FORBIDDEN");
    });

    it.each([
      ["ASSIGNED_CLASSES", "professor-a@fitburn.local"],
      ["OWN", "professor-own@fitburn.local"],
    ] as const)("escopo %s só recebe as próprias aulas", async (scope, email) => {
      const me = await staffWithScope(email, scope);
      const other = await createStaff(`outro-${scope}@fitburn.local`, "Outro Professor");
      const mine1 = await createOccurrence(at(DAY, "08:00"), { instructorId: me.user.id });
      const mine2 = await createOccurrence(at(DAY, "09:00"), { instructorId: me.user.id });
      await createOccurrence(at(DAY, "10:00"), { instructorId: other.id });
      await createOccurrence(at(DAY, "11:00"));

      const { response, rows } = await downloadCsv(me.token, DAY, DAY);

      expect(response.status).toBe(200);
      expect(rows.slice(1).map((cells) => cells[0]).sort()).toEqual([mine1.id, mine2.id].sort());
    });

    it("escopo ALL recebe todas as aulas do período", async () => {
      const token = await loginAsAdmin();
      const instructor = await createStaff("prof-todas@fitburn.local", "Professor Fictício");
      const a = await createOccurrence(at(DAY, "08:00"), { instructorId: instructor.id });
      const b = await createOccurrence(at(DAY, "09:00"));

      const { rows } = await downloadCsv(token, DAY, DAY);

      expect(rows.slice(1).map((cells) => cells[0]).sort()).toEqual([a.id, b.id].sort());
    });
  });

  describe("Dados pessoais fora do arquivo", () => {
    it("o CSV baixado não traz nome, e-mail, documento, senha, token nem IDs de reserva ou cliente", async () => {
      const adminToken = await loginAsAdmin();
      const clientProfile = await createAccessProfile({ name: "Cliente", isSystem: true });
      const client = await createUser({
        email: "maria.ficticia@exemplo.test",
        password: PASSWORD,
        profileId: clientProfile.id,
        fullName: "Maria Fictícia Souza",
        document: "111.222.333-44",
      });
      const instructor = await createStaff("rafael.ficticio@exemplo.test", "Rafael Fictício Lima");
      const occurrence = await createOccurrence(at(DAY, "18:00"), {
        instructorId: instructor.id,
        name: "Yoga Fictícia",
      });
      const reservation = await createReservation(client.id, occurrence.id, "CONFIRMED");
      const cancelled = await createReservation(client.id, occurrence.id, "CANCELLED");

      const { response, text } = await downloadCsv(adminToken, DAY, DAY);

      expect(response.status).toBe(200);
      // Controle positivo: o download é o da ocorrência, não um corpo vazio.
      expect(text).toContain(occurrence.id);
      expect(text).toContain("Yoga Fictícia");
      const forbidden = [
        "Maria",
        "Fictícia Souza",
        "Rafael",
        "maria.ficticio@exemplo.test",
        "rafael.ficticio@exemplo.test",
        "@",
        "111.222.333-44",
        "11122233344",
        client.passwordHash,
        "$argon2",
        adminToken,
        client.id,
        instructor.id,
        reservation.id,
        cancelled.id,
      ];
      for (const value of forbidden) {
        expect(text, `o CSV não pode conter "${value}"`).not.toContain(value);
      }
    });
  });
});
