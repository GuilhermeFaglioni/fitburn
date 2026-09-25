import type { INestApplication } from "@nestjs/common";
import request from "supertest";

export async function loginAndGetAccessToken(
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> {
  const response = await request(app.getHttpServer()).post("/api/auth/login").send({ email, password });
  return response.body.accessToken as string;
}
