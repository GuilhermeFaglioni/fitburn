import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Client } from "pg";
import { cleanDatabase, testPrisma } from "./db-test-helper.js";
import { createOccurrence, createReservation } from "./factories.js";

const ROOT = path.resolve(__dirname, "../../..");
const dockerAvailable = spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
const platform = process.arch === "arm64" ? "linux/arm64" : "linux/amd64";
const runId = randomUUID().replaceAll("-", "").slice(0, 10);
const image = `fitburn-backup-test-${runId}`;
const backupVolume = `fitburn-backup-test-${runId}`;
const testNetwork = `fitburn-backup-network-${runId}`;
const heartbeatContainer = `fitburn-backup-heartbeat-${runId}`;
const restoreDatabase = `fitburn_backup_restore_t93_${runId}`;

let databaseUrl: URL;
let adminClient: Client | undefined;
let sourceClient: Client | undefined;
let restoreClient: Client | undefined;
let heartbeatUrl: string;
let publicRecipient: string;
let identityDirectory: string;
let fixtureEmail: string;
let fixtureReservationId: string;
let fixtureSheetTitle: string;
let fixturePoints: number;

function docker(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync("docker", args, { cwd: ROOT, encoding: "utf8", env });
}

function expectSuccessful(result: ReturnType<typeof docker>, operation: string): void {
  expect(result.status, `${operation} falhou`).toBe(0);
}

function databaseConnectionString(database: string, hostname = databaseUrl.hostname): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${database}`;
  url.hostname = hostname;
  url.searchParams.delete("schema");
  return url.toString();
}

function backupEnvironment(database: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PGHOST: "host.docker.internal",
    PGPORT: databaseUrl.port || "5432",
    PGUSER: decodeURIComponent(databaseUrl.username),
    PGPASSWORD: decodeURIComponent(databaseUrl.password),
    PGDATABASE: database,
    BACKUP_DESTINATION: "file:///backups",
    BACKUP_STORAGE_ENDPOINT: "https://storage.example.test",
    BACKUP_STORAGE_REGION: "us-east-1",
    BACKUP_STORAGE_ACCESS_KEY_ID: "backup-integration-access-key",
    BACKUP_STORAGE_SECRET_ACCESS_KEY: "backup-integration-secret-key",
    BACKUP_AGE_RECIPIENT: publicRecipient,
    BACKUP_HEARTBEAT_URL: heartbeatUrl,
  };
}

function runBackup(database: string) {
  const env = backupEnvironment(database);
  const passThrough = [
    "PGHOST",
    "PGPORT",
    "PGUSER",
    "PGPASSWORD",
    "PGDATABASE",
    "BACKUP_DESTINATION",
    "BACKUP_STORAGE_ENDPOINT",
    "BACKUP_STORAGE_REGION",
    "BACKUP_STORAGE_ACCESS_KEY_ID",
    "BACKUP_STORAGE_SECRET_ACCESS_KEY",
    "BACKUP_AGE_RECIPIENT",
    "BACKUP_HEARTBEAT_URL",
  ];
  return docker(
    [
      "run",
      "--rm",
      "--platform",
      platform,
      "--network",
      testNetwork,
      "--add-host",
      "host.docker.internal:host-gateway",
      "--volume",
      `${backupVolume}:/backups`,
      ...passThrough.flatMap((name) => ["--env", name]),
      image,
      "/app/backup.sh",
    ],
    env,
  );
}

async function waitForHeartbeatMonitor(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const readiness = docker([
      "exec",
      heartbeatContainer,
      "node",
      "-e",
      "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.status===204?0:1)).catch(()=>process.exit(1))",
    ]);
    if (readiness.status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("O monitor de heartbeat de teste não ficou pronto");
}

async function createBackupFixture(): Promise<void> {
  const profile = await testPrisma.accessProfile.create({ data: { name: `backup-${runId}` } });
  const client = await testPrisma.user.create({
    data: {
      email: `backup-client-${runId}@fitburn.example`,
      fullName: "Cliente de backup",
      passwordHash: "backup-fixture-hash",
      profileId: profile.id,
    },
  });
  const instructor = await testPrisma.user.create({
    data: {
      email: `backup-instructor-${runId}@fitburn.example`,
      fullName: "Professor de backup",
      passwordHash: "backup-fixture-hash",
      profileId: profile.id,
    },
  });
  const occurrence = await createOccurrence(new Date("2026-10-20T12:00:00.000Z"), {
    instructorId: instructor.id,
    name: `Aula de backup ${runId}`,
  });
  const reservation = await createReservation(client.id, occurrence.id, "COMPLETED");
  const points = 17;
  fixtureSheetTitle = `Ficha de backup ${runId}`;
  fixturePoints = points;
  fixtureEmail = client.email;
  fixtureReservationId = reservation.id;
  await testPrisma.pointsEntry.create({
    data: {
      type: "ATTENDANCE",
      points,
      occurredAt: occurrence.startsAt,
      clientId: client.id,
      reservationId: reservation.id,
    },
  });
  await testPrisma.workoutSheet.create({
    data: { title: fixtureSheetTitle, clientId: client.id, authorId: instructor.id },
  });
}

describe.skipIf(!dockerAvailable)("backup diário criptografado", () => {
  beforeAll(async () => {
    const testDatabaseUrl = process.env.DATABASE_URL_TEST;
    if (!testDatabaseUrl)
      throw new Error("DATABASE_URL_TEST é obrigatório para o backup de integração");
    databaseUrl = new URL(testDatabaseUrl);
    if (databaseUrl.pathname.replace(/^\//, "") !== "fitburn_test_t93") {
      throw new Error("O teste de backup só pode usar fitburn_test_t93");
    }
    if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
      throw new Error("O teste de backup exige PostgreSQL local; conexão remota recusada");
    }

    identityDirectory = mkdtempSync(path.join(tmpdir(), "fitburn-backup-age-"));
    const build = docker([
      "build",
      "--quiet",
      "--platform",
      platform,
      "--file",
      "docker/backup/Dockerfile",
      "--tag",
      image,
      ".",
    ]);
    expectSuccessful(build, "build da imagem de backup");

    const identityPath = path.join(identityDirectory, "identity.txt");
    const identity = docker([
      "run",
      "--rm",
      "--platform",
      platform,
      "--user",
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      "--volume",
      `${identityDirectory}:/keys`,
      "--entrypoint",
      "age-keygen",
      image,
      "-o",
      "/keys/identity.txt",
    ]);
    expectSuccessful(identity, "geração de identidade age de teste");
    const identityContents = readFileSync(identityPath, "utf8");
    const recipient = /^# public key: (age1\S+)$/m.exec(identityContents)?.[1];
    if (!recipient) throw new Error("Recipient público age não foi gerado");
    publicRecipient = recipient;

    await cleanDatabase();
    await createBackupFixture();

    const adminUrl = databaseConnectionString("postgres");
    adminClient = new Client({ connectionString: adminUrl });
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${restoreDatabase}"`);

    const network = docker(["network", "create", testNetwork]);
    expectSuccessful(network, "criação da rede temporária de integração");
    const heartbeat = docker([
      "run",
      "--detach",
      "--name",
      heartbeatContainer,
      "--network",
      testNetwork,
      "--network-alias",
      "heartbeat",
      "--entrypoint",
      "node",
      "node:22-alpine",
      "-e",
      "const http=require('node:http');http.createServer((req,res)=>{if(req.url==='/health'){res.writeHead(204).end();return}console.log('heartbeat');res.writeHead(204).end()}).listen(3000,'0.0.0.0')",
    ]);
    expectSuccessful(heartbeat, "inicialização do monitor de heartbeat de teste");
    heartbeatUrl = "http://heartbeat:3000/backup";
    const volume = docker(["volume", "create", backupVolume]);
    expectSuccessful(volume, "criação do volume temporário de backup");
    await waitForHeartbeatMonitor();
  }, 300_000);

  afterAll(async () => {
    if (sourceClient) await sourceClient.end();
    if (restoreClient) await restoreClient.end();
    if (adminClient) {
      await adminClient.query(`DROP DATABASE IF EXISTS "${restoreDatabase}" WITH (FORCE)`);
      await adminClient.end();
    }
    docker(["rm", "--force", heartbeatContainer]);
    docker(["network", "rm", testNetwork]);
    docker(["volume", "rm", "--force", backupVolume]);
    docker(["image", "rm", "--force", image]);
    if (identityDirectory) rmSync(identityDirectory, { recursive: true, force: true });
    await cleanDatabase();
  }, 300_000);

  it("restaura dump comprimido e cifrado, aplica retenção e só envia heartbeat após sucesso", async () => {
    const missingConfig = docker([
      "run",
      "--rm",
      "--platform",
      platform,
      "--entrypoint",
      "/usr/local/bin/backup-entrypoint",
      image,
    ]);
    expect(missingConfig.status).not.toBe(0);
    expect(missingConfig.stderr).toContain("PGHOST é obrigatório");

    const seededFiles = [
      "mkdir -p /backups/daily /backups/weekly",
      ...Array.from({ length: 16 }, (_, index) => {
        const suffix = String(index + 1).padStart(2, "0");
        return `: > /backups/daily/backup-20200101T0000${suffix}Z.sql.gz.age`;
      }),
      ...Array.from({ length: 9 }, (_, index) => {
        const week = String(index + 1).padStart(2, "0");
        return `: > /backups/weekly/backup-2020W${week}.sql.gz.age`;
      }),
    ].join("; ");
    const seed = docker([
      "run",
      "--rm",
      "--platform",
      platform,
      "--volume",
      `${backupVolume}:/backups`,
      "--entrypoint",
      "/bin/sh",
      image,
      "-c",
      seededFiles,
    ]);
    expectSuccessful(seed, "preparo dos arquivos antigos de retenção");

    const successfulBackup = runBackup(databaseUrl.pathname.replace(/^\//, ""));
    expectSuccessful(successfulBackup, "execução diária de backup");
    const successfulHeartbeats = docker(["logs", heartbeatContainer]);
    expect(successfulHeartbeats.stdout.trim().split("\n").filter(Boolean)).toEqual(["heartbeat"]);

    const list = docker([
      "run",
      "--rm",
      "--platform",
      platform,
      "--volume",
      `${backupVolume}:/backups`,
      "--entrypoint",
      "/bin/sh",
      image,
      "-c",
      "find /backups/daily /backups/weekly -type f -name 'backup-*.sql.gz.age' -print | sort",
    ]);
    expectSuccessful(list, "listagem dos arquivos de backup");
    const backupFiles = list.stdout.trim().split("\n").filter(Boolean);
    const dailyFiles = backupFiles.filter((file) => file.startsWith("/backups/daily/"));
    const weeklyFiles = backupFiles.filter((file) => file.startsWith("/backups/weekly/"));
    expect(dailyFiles).toHaveLength(14);
    expect(weeklyFiles).toHaveLength(8);
    const encryptedFile = dailyFiles[dailyFiles.length - 1];
    expect(encryptedFile).toBeTruthy();

    const restoreEnv = {
      ...process.env,
      PGHOST: "host.docker.internal",
      PGPORT: databaseUrl.port || "5432",
      PGUSER: decodeURIComponent(databaseUrl.username),
      PGPASSWORD: decodeURIComponent(databaseUrl.password),
      PGDATABASE: restoreDatabase,
      BACKUP_FILE: encryptedFile,
    };
    const restored = docker(
      [
        "run",
        "--rm",
        "--platform",
        platform,
        "--user",
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        "--network",
        testNetwork,
        "--add-host",
        "host.docker.internal:host-gateway",
        "--volume",
        `${backupVolume}:/backups:ro`,
        "--volume",
        `${identityDirectory}:/keys:ro`,
        ...["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "BACKUP_FILE"].flatMap(
          (name) => ["--env", name],
        ),
        "--entrypoint",
        "/bin/sh",
        image,
        "-c",
        'set -o pipefail; age --decrypt --identity /keys/identity.txt "$BACKUP_FILE" | gzip -dc | psql --set ON_ERROR_STOP=1',
      ],
      restoreEnv,
    );
    expectSuccessful(restored, "descriptografia, descompressão e restauração");

    sourceClient = new Client({ connectionString: testDatabaseUrlFromEnv() });
    restoreClient = new Client({ connectionString: databaseConnectionString(restoreDatabase) });
    await sourceClient.connect();
    await restoreClient.connect();
    const sourceCounts = await databaseCounts(sourceClient);
    const restoredCounts = await databaseCounts(restoreClient);
    expect(restoredCounts).toEqual(sourceCounts);

    const sample = await restoreClient.query(
      `SELECT u.email,
              r.status::text AS reservation_status,
              ws.title AS sheet_title,
              pe.points
         FROM users u
         JOIN reservations r ON r."clientId" = u.id
         JOIN workout_sheets ws ON ws."clientId" = u.id
         JOIN points_entries pe ON pe."clientId" = u.id AND pe."reservationId" = r.id
        WHERE u.email = $1 AND r.id = $2`,
      [fixtureEmail, fixtureReservationId],
    );
    expect(sample.rows).toEqual([
      {
        email: fixtureEmail,
        reservation_status: "COMPLETED",
        sheet_title: fixtureSheetTitle,
        points: fixturePoints,
      },
    ]);

    const foreignKeys = await restoreClient.query<{ conname: string; convalidated: boolean }>(
      `SELECT conname, convalidated
         FROM pg_constraint
        WHERE contype = 'f'
          AND connamespace = 'public'::regnamespace
        ORDER BY conname`,
    );
    expect(foreignKeys.rows.length).toBeGreaterThan(0);
    expect(
      foreignKeys.rows.filter(({ convalidated }) => !convalidated).map(({ conname }) => conname),
    ).toEqual([]);

    await sourceClient.end();
    sourceClient = undefined;
    await restoreClient.end();
    restoreClient = undefined;

    const failedBackup = runBackup("fitburn_database_does_not_exist_t93");
    expect(failedBackup.status).not.toBe(0);
    const failedHeartbeats = docker(["logs", heartbeatContainer]);
    expect(failedHeartbeats.stdout.trim().split("\n").filter(Boolean)).toEqual(["heartbeat"]);
  }, 300_000);
});

function testDatabaseUrlFromEnv(): string {
  const value = process.env.DATABASE_URL_TEST;
  if (!value) throw new Error("DATABASE_URL_TEST é obrigatório");
  return value;
}

async function databaseCounts(client: Client): Promise<Record<string, number>> {
  const tables = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  const counts: Array<[string, number]> = [];
  for (const { table_name } of tables.rows) {
    const identifier = `"${table_name.replaceAll('"', '""')}"`;
    const result = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM public.${identifier}`,
    );
    counts.push([table_name, Number(result.rows[0].count)]);
  }
  return Object.fromEntries(counts);
}
