import type { INestApplication } from "@nestjs/common";
import request from "supertest";

export async function loginAndGetAccessToken(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const response = await request(app.getHttpServer()).post("/api/auth/login").send({ email, password });
  if (typeof response.body.accessToken !== "string") {
    throw new Error(
      `Login de teste falhou para ${email}: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }
  return response.body.accessToken;
}
