import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  define: {
    // Vinext does not automatically inline these Next.js public variables.
    // Cloudflare production uses the real SIGhRA bridge in pilot mode.
    "process.env.NEXT_PUBLIC_SIGHRA_JOURNEY_MODE": JSON.stringify("pilot"),
    "process.env.NEXT_PUBLIC_SIGHRA_JOURNEY_PROVIDER": JSON.stringify("sighra"),
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
