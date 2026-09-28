import assert from "node:assert/strict";
import test from "node:test";
import { journeyBatchOutcome, matchBatchJobs, summarizeJourneyBatch, type JourneyBatchItem, type JourneyBatchJob } from "../src/lib/sighra/journey-batch";
import type { JourneyPreview, JourneyRecordSnapshot } from "../src/lib/sighra/journey";

const record = (login: string): JourneyRecordSnapshot => ({
  recordId: crypto.randomUUID(), login, driverName: `Condutor ${login}`, operationalDate: "2026-09-25",
  shift: "04:00:00", status: "ACIONADO", entryTime: null, exitTime: null, updatedAt: "2026-09-25T10:00:00Z",
});
const job = (login: string, status: JourneyBatchJob["status"]): JourneyBatchJob => ({
  id: crypto.randomUUID(), login, status, created_at: "2026-09-25T10:00:00Z", since_date: "2026-09-25", result: null, error: null,
});
const preview = (canApply: boolean, conflict = false): JourneyPreview => ({
  record: record("1"),
  resolution: { status: "safe", pair: { start: { id: "1", login: "1", name: "INICIO DE JORNADA", type: "start", occurredAt: "2026-09-25T04:00:00", receivedAt: null, vehicle: null }, end: null }, message: "ok" },
  conflicts: conflict ? [{ field: "entry_time", current: "05:00:00", sighra: "04:00:00" }] : [],
  changes: canApply ? { entry_time: "04:00:00" } : {},
  canApply,
});

test("lote separa pendentes, seguros, inalterados, revisão e falhas", () => {
  assert.equal(journeyBatchOutcome(job("1", "queued"), null), "pending");
  assert.equal(journeyBatchOutcome(job("1", "completed"), preview(true)), "safe");
  assert.equal(journeyBatchOutcome(job("1", "completed"), preview(false)), "unchanged");
  assert.equal(journeyBatchOutcome(job("1", "completed"), preview(false, true)), "review");
  assert.equal(journeyBatchOutcome(job("1", "failed"), null), "failed");
});

test("resumo do lote informa progresso e cada resultado", () => {
  const outcomes: JourneyBatchItem["outcome"][] = ["safe", "safe", "pending", "review", "failed", "unchanged"];
  const items = outcomes.map((outcome, index) => ({ record: record(String(index + 1)), job: null, preview: null, outcome }));
  assert.deepEqual(summarizeJourneyBatch(items), {
    total: 6, completed: 5, pending: 1, safe: 2, unchanged: 1, review: 1, failed: 1,
  });
});

test("resultado do lote volta ao condutor pelo login mesmo com zeros à esquerda", () => {
  const records = [record("00123"), record("456")];
  const jobs = [job("456", "completed"), job("123", "completed")];
  assert.deepEqual(matchBatchJobs(records, jobs).map((value) => value?.login), ["123", "456"]);
});
