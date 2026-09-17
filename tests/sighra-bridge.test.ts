import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/integracoes/sighra/route";

test("ponte recusa chave ausente, inválida e mensagens indevidas antes de acessar o banco", async () => {
  const original = process.env.SIGHRA_BRIDGE_TOKEN;
  const secret = "bridge-test-".padEnd(40, "x");
  const request = (body: string, token?: string) => new Request("http://localhost/api/integracoes/sighra", {
    method: "POST", body, headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  try {
    delete process.env.SIGHRA_BRIDGE_TOKEN;
    assert.equal((await POST(request("{}"))).status, 503);
    process.env.SIGHRA_BRIDGE_TOKEN = secret;
    assert.equal((await POST(request('{"database_ok":true}'))).status, 401);
    assert.equal((await POST(request('{"database_ok":true}', "wrong"))).status, 401);
    for (const body of ["bad json", "null", "{}", '{"database_ok":"true"}', '{"database_ok":true,"sql":"DELETE FROM drivers"}']) {
      assert.equal((await POST(request(body, secret))).status, 400);
    }
    const oversized = await POST(request("x".repeat(1025), secret));
    assert.equal(oversized.status, 413);
    assert.equal(oversized.headers.get("cache-control"), "no-store");
  } finally {
    if (original === undefined) delete process.env.SIGHRA_BRIDGE_TOKEN;
    else process.env.SIGHRA_BRIDGE_TOKEN = original;
  }
});
