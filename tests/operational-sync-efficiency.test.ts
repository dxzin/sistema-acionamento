import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const operationPage = readFileSync(new URL("../src/app/acionamento/page.tsx", import.meta.url), "utf8");
const dispatchService = readFileSync(new URL("../src/lib/services/dispatch-service.ts", import.meta.url), "utf8");
const scheduleService = readFileSync(new URL("../src/lib/services/schedule-service.ts", import.meta.url), "utf8");
const presenceMigration = readFileSync(
  new URL("../supabase/migrations/20261013000000_optimize_presence_heartbeat.sql", import.meta.url),
  "utf8"
);
const presenceConflictFix = readFileSync(
  new URL("../supabase/migrations/20261014010000_fix_presence_plpgsql_conflict.sql", import.meta.url),
  "utf8"
);
const header = readFileSync(new URL("../src/components/layout/Header.tsx", import.meta.url), "utf8");
const historyPage = readFileSync(new URL("../src/app/historico/page.tsx", import.meta.url), "utf8");
const closedTripMigration = readFileSync(
  new URL("../supabase/migrations/20261016000000_driver_closed_trip.sql", import.meta.url),
  "utf8"
);

test("Realtime acompanha folhas, escalas e alterações no cadastro dos condutores", () => {
  assert.match(operationPage, /filter: `daily_sheet_id=eq\.\$\{sheetId\}`/);
  assert.match(operationPage, /filter: `id=eq\.\$\{sheetId\}`/);
  assert.match(operationPage, /filter: `schedule_id=eq\.\$\{scheduleId\}`/);
  assert.match(operationPage, /table: "drivers"/);
  assert.match(operationPage, /dispatchService\.invalidateDriversCache\(\)/);
  assert.match(closedTripMigration, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.drivers/);
  assert.doesNotMatch(operationPage, /table: "dispatches",\s*\n\s*}\s*,/);
});

test("polling de segurança e presença usam intervalos reduzidos e ignoram abas ocultas", () => {
  assert.match(operationPage, /document\.visibilityState !== "visible"/);
  assert.match(operationPage, /window\.setInterval\(heartbeat, 60_000\)/);
  assert.match(operationPage, /syncStatus === "live" \? 120_000 : 15_000/);
  assert.match(presenceMigration, /interval '150 seconds'/);
  assert.match(presenceMigration, /ON CONFLICT ON CONSTRAINT operator_presence_pkey/);
  assert.match(presenceConflictFix, /#variable_conflict use_column/);
  assert.match(presenceConflictFix, /interval '150 seconds'/);
});

test("renderização do relógio e paginação da auditoria evitam trabalho repetido", () => {
  assert.match(header, /function BrasiliaClock\(\)/);
  assert.match(historyPage, /append && catalogRef\.current/);
  assert.doesNotMatch(historyPage, /from\("audit_logs"\)\.select\("\*"\)/);
});

test("catálogos usam cache e consultas de escala selecionam somente os campos necessários", () => {
  assert.match(dispatchService, /catalogTtlMs = 5 \* 60_000/);
  assert.doesNotMatch(scheduleService, /monthly_schedule_entries"\)\s*\.select\("\*"\)/s);
  assert.match(scheduleService, /select\("id,schedule_id,driver_id,day_of_month,scale_code,shift_letter,shift_time,updated_at"\)/);
});
