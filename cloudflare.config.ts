import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "sistema-acionamento",
    entrypoint: "./cloudflare-worker.ts",
    compatibilityDate: "2026-10-28",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      API_RATE_LIMITER: bindings.rateLimit({
        namespace: "1001",
        simple: { limit: 40, period: 10 },
      }),
      MUTATION_RATE_LIMITER: bindings.rateLimit({
        namespace: "1002",
        simple: { limit: 10, period: 10 },
      }),
    },
  }),
});
