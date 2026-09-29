import assert from "node:assert/strict";
import test from "node:test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "../src/proxy";

test("proxy autentica páginas sem duplicar invocações das rotas de API", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });

  assert.equal(matches("/acionamento"), true);
  assert.equal(matches("/login"), true);
  assert.equal(matches("/api/integracoes/sighra/tarefas"), false);
  assert.equal(matches("/_next/static/chunks/app.js"), false);
});
