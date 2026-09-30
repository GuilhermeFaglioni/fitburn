/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt": o service worker novo, baixado depois de um deploy, espera e o
      // app mostra "Nova versão disponível" com um botão de recarregar (UpdateBanner).
      // Assim a versão em uso não troca no meio de uma ação do usuário.
      registerType: "prompt",
      // Só a casca (o build da Vite) é precacheada. Nenhuma regra de
      // runtimeCaching é declarada, então chamadas a /api nunca passam
      // pelo cache do service worker — dados e ações sempre exigem rede,
      // por decisão do MVP.
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: "Fitburn",
        short_name: "Fitburn",
        description: "App de alunos e equipe da Fitburn Brasil",
        lang: "pt-BR",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        id: "/",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "flame.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3345",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Os testes de contraste leem as folhas de estilo de src/styles como texto (?raw).
    css: { include: [/src\/styles\/.*\.css/] },
    setupFiles: ["./test/setup.ts"],
  },
});
