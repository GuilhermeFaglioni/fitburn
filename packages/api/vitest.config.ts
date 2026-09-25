import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// NestJS injeta por tipo no construtor, o que depende de metadados de decorator
// (emitDecoratorMetadata). O transform padrão do Vitest (esbuild) não emite isso —
// por isso o build de teste passa pelo SWC, que suporta decoratorMetadata.
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: "es6" },
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: "es2022",
        keepClassNames: true,
      },
    }),
  ],
  test: {
    environment: "node",
    globals: true,
    include: ["test/**/*.spec.ts", "test/**/*.e2e-spec.ts"],
    setupFiles: ["./test/setup-env.ts"],
    // Todos os arquivos de teste compartilham o mesmo Postgres de teste
    // físico (cada um limpa as tabelas no beforeEach). Rodar arquivos em
    // paralelo causaria um cleanDatabase() de um arquivo apagar fixtures
    // de outro no meio do teste — por isso a suíte roda sequencial.
    fileParallelism: false,
  },
});
