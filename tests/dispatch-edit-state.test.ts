import test from "node:test";
import assert from "node:assert/strict";
import {
  createDispatchSaveSnapshot,
  markDispatchSnapshotSaving,
  mergeServerDispatches,
  PendingDispatchEdits,
  resolveDispatchSnapshotFailure,
  resolveDispatchSnapshotSuccess,
  stageDispatchChanges,
} from "../src/lib/editing/dispatch-edit-state";
import type { DispatchRowModel } from "../src/types/domain";

function row(id: string, observations: string | null, updatedAt = "2026-09-15T10:00:00Z"): DispatchRowModel {
  return {
    id,
    daily_sheet_id: "sheet-1",
    driver_id: `driver-${id}`,
    forecast_start_time: null,
    dispatch_status: "",
    abono_reason: null,
    abono_authorized_by: null,
    origin_location_id: null,
    entry_time: null,
    vehicle_id: null,
    cargo_status: null,
    destination_location_id: null,
    final_destination_location_id: null,
    exit_time: null,
    observations,
    scale_day_status: null,
    total_worked_minutes: null,
    next_day_forecast_time: null,
    created_at: "2026-09-15T09:00:00Z",
    updated_at: updatedAt,
    driver: {
      id: `driver-${id}`,
      name: `Condutor ${id}`,
      login_matricula: id,
      base_id: "base-1",
      is_active: true,
      created_at: "2026-09-15T09:00:00Z",
      updated_at: "2026-09-15T09:00:00Z",
    },
  };
}

test("uma edição substitui conteúdo existente e entra no lote", () => {
  let version = 0;
  const edits = stageDispatchChanges({}, "1", { observations: "novo conteúdo" }, row("1", "antigo").updated_at, () => ++version);
  const snapshot = createDispatchSaveSnapshot(edits);

  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].changes.observations, "novo conteúdo");
  assert.equal(snapshot[0].expectedUpdatedAt, "2026-09-15T10:00:00Z");
});

test("refresh atualiza dados limpos e preserva a célula dirty", () => {
  let version = 0;
  const local = row("1", "texto parcial");
  local.dispatch_status = "ACIONADO";
  const edits = stageDispatchChanges({}, "1", { observations: "texto parcial" }, local.updated_at, () => ++version);
  const server = row("1", "texto antigo", "2026-09-15T10:01:00Z");
  server.dispatch_status = "APOIO";

  const [merged] = mergeServerDispatches([server], [local], edits);
  assert.equal(merged.observations, "texto parcial");
  assert.equal(merged.dispatch_status, "APOIO");
  assert.equal(merged.updated_at, "2026-09-15T10:01:00Z");
});

test("uma colagem de 20 linhas produz um único snapshot em lote completo", () => {
  let edits: PendingDispatchEdits = {};
  let version = 0;
  for (let index = 0; index < 20; index++) {
    edits = stageDispatchChanges(edits, String(index), { observations: `valor ${index}` }, row(String(index), null).updated_at, () => ++version);
  }
  const snapshot = createDispatchSaveSnapshot(edits);
  assert.equal(snapshot.length, 20);
  assert.deepEqual(snapshot.map((item) => item.changes.observations), Array.from({ length: 20 }, (_, index) => `valor ${index}`));
});

test("falha mantém a edição local marcada para nova tentativa", () => {
  let version = 0;
  let edits = stageDispatchChanges({}, "1", { observations: "não perder" }, row("1", null).updated_at, () => ++version);
  const snapshot = createDispatchSaveSnapshot(edits);
  edits = markDispatchSnapshotSaving(edits, snapshot);
  edits = resolveDispatchSnapshotFailure(edits, snapshot, "rede indisponível");

  assert.equal(edits["1"].fields.observations?.value, "não perder");
  assert.equal(edits["1"].fields.observations?.status, "error");
  assert.equal(createDispatchSaveSnapshot(edits).length, 1);
});

test("resposta antiga não remove nem sobrescreve uma versão mais nova", () => {
  let version = 0;
  let edits = stageDispatchChanges({}, "1", { observations: "teste" }, row("1", null).updated_at, () => ++version);
  const requestA = createDispatchSaveSnapshot(edits);
  edits = markDispatchSnapshotSaving(edits, requestA);
  edits = stageDispatchChanges(edits, "1", { observations: "teste novo" }, row("1", "teste").updated_at, () => ++version);
  edits = resolveDispatchSnapshotSuccess(edits, requestA, [row("1", "teste", "2026-09-15T10:02:00Z")]);

  assert.equal(edits["1"].fields.observations?.value, "teste novo");
  assert.equal(edits["1"].fields.observations?.status, "pending");
  const requestB = createDispatchSaveSnapshot(edits);
  assert.equal(requestB[0].changes.observations, "teste novo");
  assert.equal(requestB[0].expectedUpdatedAt, "2026-09-15T10:02:00Z");
});
