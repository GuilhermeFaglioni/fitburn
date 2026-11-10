import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Os builds extras dividem o mesmo projeto Astro: um arquivo de cada vez evita corrida no cache.
    fileParallelism: false,
    // Os testes rodam builds extras do Astro (SEO indexável e analytics) num outDir temporário.
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
