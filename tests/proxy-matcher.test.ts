import assert from "node:assert/strict";
import test from "node:test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { config } from "../src/proxy";
import { updateSession } from "../src/lib/supabase/middleware";

test("proxy autentica páginas sem duplicar invocações das rotas de API", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });

  assert.equal(matches("/acionamento"), true);
  assert.equal(matches("/login"), true);
  assert.equal(matches("/api/integracoes/sighra/tarefas"), false);
  assert.equal(matches("/_next/static/chunks/app.js"), false);
});

test("proxy impede cache compartilhado nas páginas de autenticação", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";

  try {
    const response = await updateSession(new NextRequest("https://example.com/login"));

    assert.equal(
      response.headers.get("cache-control"),
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
    assert.equal(response.headers.get("expires"), "0");
    assert.equal(response.headers.get("pragma"), "no-cache");
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  }
});
