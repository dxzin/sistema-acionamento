import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260929010000_restrict_operational_writes.sql", import.meta.url),
  "utf8"
);
const dispatchService = readFileSync(
  new URL("../src/lib/services/dispatch-service.ts", import.meta.url),
  "utf8"
);

test("operational tables reject direct authenticated mutations", () => {
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.daily_sheets FROM authenticated, anon/i);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.dispatches FROM authenticated, anon/i);
  assert.match(migration, /DROP POLICY IF EXISTS "Authenticated users can update daily sheets"/i);
  assert.match(migration, /DROP POLICY IF EXISTS "Allow authenticated update on open dispatches"/i);
});

test("all operational row changes are audited by database triggers", () => {
  assert.match(migration, /AFTER INSERT OR UPDATE OR DELETE ON public\.daily_sheets/i);
  assert.match(migration, /AFTER INSERT OR UPDATE OR DELETE ON public\.dispatches/i);
  assert.match(migration, /INSERT INTO public\.audit_logs/i);
});

test("sheet creation and reconciliation use the transactional RPC", () => {
  assert.match(dispatchService, /rpc\("ensure_daily_sheet_with_dispatches"/);
  assert.doesNotMatch(dispatchService, /from\("daily_sheets"\)\s*\.upsert/s);
  assert.doesNotMatch(dispatchService, /from\("dispatches"\)\s*\.(?:insert|upsert|update|delete)/s);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.ensure_daily_sheet_with_dispatches/i);
  assert.match(migration, /p_date NOT IN \(v_today, v_today \+ 1\)/i);
  assert.match(migration, /IF v_sheet\.status <> 'OPEN' THEN RAISE EXCEPTION 'DAILY_SHEET_CLOSED'/i);
});

test("dispatch editing locks an open sheet before changing the row", () => {
  assert.match(migration, /WHERE id = v_old\.daily_sheet_id AND status = 'OPEN'\s+FOR SHARE/i);
  assert.match(migration, /IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_SHEET_CLOSED'/i);
});
