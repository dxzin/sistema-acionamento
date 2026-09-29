import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const operationPage = readFileSync(new URL("../src/app/acionamento/page.tsx", import.meta.url), "utf8");
const dispatchService = readFileSync(new URL("../src/lib/services/dispatch-service.ts", import.meta.url), "utf8");
const scheduleService = readFileSync(new URL("../src/lib/services/schedule-service.ts", import.meta.url), "utf8");
const presenceMigration = readFileSync(
  new URL("../supabase/migrations/20260929020000_reduce_presence_polling.sql", import.meta.url),
  "utf8"
);

test("Realtime acompanha somente as folhas e escalas abertas pelo operador", () => {
  assert.match(operationPage, /filter: `daily_sheet_id=eq\.\$\{sheetId\}`/);
  assert.match(operationPage, /filter: `id=eq\.\$\{sheetId\}`/);
  assert.match(operationPage, /filter: `schedule_id=eq\.\$\{scheduleId\}`/);
  assert.doesNotMatch(operationPage, /table: "dispatches",\s*\n\s*}\s*,/);
});

test("polling de segurança e presença usam intervalos reduzidos e ignoram abas ocultas", () => {
  assert.match(operationPage, /document\.visibilityState !== "visible"/);
  assert.match(operationPage, /window\.setInterval\(heartbeat, 30_000\)/);
  assert.match(operationPage, /syncStatus === "live" \? 120_000 : 15_000/);
  assert.match(presenceMigration, /interval '90 seconds'/);
});

test("catálogos usam cache e consultas de escala selecionam somente os campos necessários", () => {
  assert.match(dispatchService, /catalogTtlMs = 5 \* 60_000/);
  assert.doesNotMatch(scheduleService, /monthly_schedule_entries"\)\s*\.select\("\*"\)/s);
  assert.match(scheduleService, /select\("id,schedule_id,driver_id,day_of_month,scale_code,shift_letter,shift_time,updated_at"\)/);
});
