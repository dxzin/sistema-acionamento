import assert from "node:assert/strict";
import test from "node:test";
import { journeyBatchOutcome, matchBatchJobs, summarizeJourneyBatch, summarizeJourneyEndLocation, type JourneyBatchItem, type JourneyBatchJob } from "../src/lib/sighra/journey-batch";
import type { JourneyPreview, JourneyRecordSnapshot } from "../src/lib/sighra/journey";

const record = (login: string): JourneyRecordSnapshot => ({
  recordId: crypto.randomUUID(), login, driverName: `Condutor ${login}`, operationalDate: "2026-09-25",
  shift: "04:00:00", status: "ACIONADO", entryTime: null, exitTime: null, fleetCode: null, updatedAt: "2026-09-25T10:00:00Z",
  plannedEndLocation: null,
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

test("fim isolado após entrada preenchida entra no lote sem esconder a divergência de local", () => {
  const end = { id: "fim", login: "1", name: "FIM DE JORNADA", type: "end" as const,
    occurredAt: "2026-09-25T15:05:00", receivedAt: null, vehicle: null, location: "BELLO PARKING · Uberaba / MG" };
  const endOnly: JourneyPreview = {
    ...preview(true),
    resolution: { status: "manual_end", pair: null, end, reasons: [], message: "Conferir saída" },
    changes: { exit_time: "15:05:00" },
    endLocationComparison: { status: "different", expected: "LP", actual: end.location },
  };
  assert.equal(endOnly.canApply, true);
  assert.equal(journeyBatchOutcome(job("1", "completed"), endOnly), "safe");
  assert.equal(endOnly.endLocationComparison?.status, "different");

  const conflictingEnd = {
    ...endOnly,
    conflicts: [{ field: "exit_time" as const, current: "15:10:00", sighra: "15:05:00" }],
    canApply: false,
  };
  assert.equal(journeyBatchOutcome(job("1", "completed"), conflictingEnd), "review");
});

test("fim já preenchido e com local igual fica como já preenchido", () => {
  const end = { id: "fim", login: "1", name: "FIM DE JORNADA", type: "end" as const,
    occurredAt: "2026-09-25T15:05:00", receivedAt: null, vehicle: null, location: "GARAGEM GARBUIO · LENÇÓIS PAULISTA/SP" };
  const confirmed: JourneyPreview = {
    ...preview(false),
    record: { ...record("1"), entryTime: "04:00:00", exitTime: "15:05:00", plannedEndLocation: "LP" },
    resolution: { status: "manual_end", pair: null, end, reasons: [], message: "Conferir saída" },
    endLocationComparison: { status: "matched", expected: "LP", actual: end.location },
  };

  assert.equal(journeyBatchOutcome(job("1", "completed"), confirmed), "unchanged");
});

test("local de fim divergente é informado sem bloquear o lote", () => {
  const locationMismatch: JourneyPreview = {
    ...preview(true),
    endLocationComparison: {
      status: "different",
      expected: "LP",
      actual: "BELLO PARKING · Uberaba / MG",
    },
  };
  assert.equal(journeyBatchOutcome(job("1", "completed"), locationMismatch), "safe");
});

test("local de fim é resumido para comparação na tabela", () => {
  assert.equal(summarizeJourneyEndLocation("BELLO PARKING · Av. Leopoldino · Uberaba / MG"), "BELLO PARKING · Uberaba/MG");
  assert.equal(summarizeJourneyEndLocation("BRACELL · Lençóis Paulista / SP"), "BRACELL · Lençóis Paulista/SP");
  assert.equal(summarizeJourneyEndLocation(null), null);
});

test("placa preservada não bloqueia a saída no lote", () => {
  const platePreserved: JourneyPreview = {
    ...preview(true),
    preservedPlate: { current: "MAN1A11", sighra: "SIG1A22" },
    changes: { exit_time: "03:36:00" },
  };
  assert.equal(journeyBatchOutcome(job("1", "completed"), platePreserved), "safe");
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
