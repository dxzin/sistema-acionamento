import { build } from "esbuild";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Isolated component harness: no Next server, .env, Supabase or production API.
const { outputFiles } = await build({
  entryPoints: ["e2e/fixtures/dispatch-grid.tsx"], bundle: true, write: false,
  platform: "browser", format: "iife", jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"development"',
    "process.env.NEXT_PUBLIC_SUPABASE_URL": '""',
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '""',
    "process.env.NEXT_PUBLIC_SIGHRA_JOURNEY_MODE": '"pilot"',
    "process.env.NEXT_PUBLIC_SIGHRA_JOURNEY_PROVIDER": '"mock"',
  },
  plugins: [{ name: "local-page-mocks", setup(builder) {
    builder.onResolve({ filter: /^(next\/navigation|@\/lib\/(auth-context|services\/dispatch-service)|@\/components\/layout\/(Header|Sidebar))$/ }, () => ({
      path: fileURLToPath(new URL("dispatch-page-mocks.tsx", import.meta.url)),
    }));
  } }, ...(process.env.DISPATCH_GRID_BASELINE ? [{ name: "baseline", setup(builder) {
    builder.onLoad({ filter: /(DispatchGrid\.tsx|acionamento[\\/]page\.tsx|dispatch-edit-state\.ts)$/ }, args => ({
      contents: execFileSync("git", ["show", `${process.env.DISPATCH_GRID_BASELINE}:${args.path.slice(process.cwd().length + 1).replaceAll("\\", "/")}`], { encoding: "utf8" }),
      loader: "tsx", resolveDir: fileURLToPath(new URL("../..", import.meta.url)),
    }));
  } }] : [])],
});
createServer((request, response) => {
  if (request.url === "/grid.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" });
    response.end(outputFiles[0].text);
  } else if (request.url === "/audio/alarme.mp3") {
    const audio = readFileSync(fileURLToPath(new URL("../../public/audio/alarme.mp3", import.meta.url)));
    response.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": audio.length });
    response.end(audio);
  } else {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end('<html><body><div id="root"></div><script src="/grid.js"></script></body></html>');
  }
}).listen(3197, "127.0.0.1");
