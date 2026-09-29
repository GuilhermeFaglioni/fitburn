/** Ambiente de produção válido para os testes de segurança. */
export const validProductionEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://fitburn:fitburn@localhost:5432/fitburn_prod?schema=public",
  JWT_ACCESS_SECRET: "b7f3c1e9a4d84f6c9e2a5d7b1c3f8e6a0d4b9c2e7f1a3d5c",
  INITIAL_ADMIN_EMAIL: "admin@academia.example",
  INITIAL_ADMIN_PASSWORD: "Uma-Senha-Realmente-Forte-9!",
  INITIAL_ADMIN_NAME: "Administrador Academia",
};
