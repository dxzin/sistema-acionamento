import assert from "node:assert/strict";
import test from "node:test";
import { parseDashboardFilters, restAvailability, validDashboardToken } from "../src/lib/api/schedule-dashboard";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/v1/escala/route";

test("endpoint retorna JSON e bloqueia consultas sem credencial ou com filtros inválidos", async () => {
  const original = process.env.DASHBOARD_API_TOKEN;
  try {
    delete process.env.DASHBOARD_API_TOKEN;
    assert.equal((await GET(new NextRequest("http://localhost/api/v1/escala"))).status, 503);
    process.env.DASHBOARD_API_TOKEN = "test-secret";
    const unauthorized = await GET(new NextRequest("http://localhost/api/v1/escala"));
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get("cache-control"), "no-store");
    assert.equal(typeof (await unauthorized.json()).erro, "string");
    const invalid = await GET(new NextRequest("http://localhost/api/v1/escala?data=2026-02-30", { headers: { Authorization: "Bearer test-secret" } }));
    assert.equal(invalid.status, 400);
  } finally {
    if (original === undefined) delete process.env.DASHBOARD_API_TOKEN;
    else process.env.DASHBOARD_API_TOKEN = original;
  }
});

test("dashboard exige a credencial Bearer correta", () => {
  assert.equal(validDashboardToken(null, "secret"), false);
  assert.equal(validDashboardToken("Bearer wrong", "secret"), false);
  assert.equal(validDashboardToken("Bearer secret", ""), false);
  assert.equal(validDashboardToken("Bearer secret", "secret"), true);
});

test("valida período e paginação sem aceitar datas normalizadas ou filtros ignorados", () => {
  for (const query of ["data=2026-02-30", "inicio=2026-09-01", "inicio=2026-09-01&fim=2026-10-02", "data=2026-09-01&inicio=2026-09-01", "limite=101", "pagina=0", "matricula=", "base=", "data=2026-09-01&data=2026-09-02", "region=SP"]) {
    assert.throws(() => parseDashboardFilters(new URLSearchParams(query)), query);
  }
  const result = parseDashboardFilters(new URLSearchParams("inicio=2026-09-16&fim=2026-10-16&matricula=123&base=lp&pagina=2&limite=100"));
  assert.equal(result.base, "LP");
  assert.equal(result.pagina, 2);
  assert.equal(result.matricula, "123");
});

test("disponibilidade preserva a data na virada de jornada e após o descanso", () => {
  assert.equal(restAvailability("2026-09-16", "22:00", "06:00", 670), "2026-09-17T20:10:00.000Z");
  assert.equal(restAvailability("2026-09-16", "08:00:00", "18:00:00", 670), "2026-09-17T08:10:00.000Z");
  assert.equal(restAvailability("2026-09-16", "1°", "18:00", 670), null);
  assert.equal(restAvailability("2026-09-16", "08:00", null, 670), null);
  assert.equal(restAvailability("2026-09-16", "08:00", "25:00", 670), null);
});
