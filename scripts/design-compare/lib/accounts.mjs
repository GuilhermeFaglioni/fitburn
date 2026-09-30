import { DEMO, loadEnv } from "./env.mjs";

const env = loadEnv();
const API = process.env.API_URL ?? `http://localhost:${env.PORT ?? 3333}/api`;

/** Contas de demonstração criadas por seed-demo.mjs (todas com a senha do admin inicial do .env). */
export const ACCOUNTS = {
  admin: { email: env.INITIAL_ADMIN_EMAIL, password: env.INITIAL_ADMIN_PASSWORD },
  professor: {
    email: DEMO.staff.find((s) => s.key === "rafael").email,
    password: env.INITIAL_ADMIN_PASSWORD,
  },
  client: {
    email: DEMO.clients.find((c) => c.key === "marina").email,
    password: env.INITIAL_ADMIN_PASSWORD,
  },
};

export async function apiLogin(role) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ACCOUNTS[role]),
  });
  if (!res.ok) throw new Error(`login ${role} falhou (${res.status}); rode o seed (pnpm design:seed)`);
  return (await res.json()).accessToken;
}

/** Cliente HTTP autenticado da API, para os resolvers descobrirem ids. */
export async function apiFor(role) {
  const token = await apiLogin(role);
  return async (path) => {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return res.json();
  };
}
