import assert from "node:assert/strict";
import test from "node:test";
import type { DispatchRowModel } from "../src/types/domain";
import {
  buildJourneyPreview,
  isJourneyEligible,
  pairJourneyEvents,
  resolveJourneyForRecord,
  resolveJourneyRecord,
  snapshotJourneyRecord,
  type JourneyEvent,
} from "../src/lib/sighra/journey";

const event = (id: string, type: "start" | "end", occurredAt: string): JourneyEvent => ({
  id, type, occurredAt, login: "45778", name: type === "start" ? "INÍCIO DE JORNADA" : "FIM DE JORNADA",
  receivedAt: null, vehicle: null,
});

function row(id = "abc", name = "JOÃO", login = "45778", status = "ACIONADO"): DispatchRowModel {
  return {
    id, daily_sheet_id: "sheet", driver_id: `driver-${id}`, dispatch_status: status,
    entry_time: null, exit_time: null, created_at: "2026-09-19T00:00:00Z", updated_at: "2026-09-19T10:00:00Z",
    driver: {
      id: `driver-${id}`, name, login_matricula: login, base_id: "base", default_shift: "20H",
      default_start_time: "20:00:00", is_active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    },
  };
}

test("allowlist consulta somente ACIONADO, TROCA e APOIO", () => {
  for (const status of ["ACIONADO", " troca ", "apoio"]) assert.equal(isJourneyEligible(status), true);
  for (const status of ["BALDEIO", "ABONADO", "AFASTADO", "ATESTADO", "FOLGA", "", "OUTRO"]) assert.equal(isJourneyEligible(status), false);
});

test("turno 20h atravessa a meia-noite e pertence à data do início", () => {
  const record = snapshotJourneyRecord(row(), "2026-09-19");
  const resolved = resolveJourneyForRecord([
    event("start-1", "start", "2026-09-19T20:10:00"),
    event("end-1", "end", "2026-09-20T09:00:00"),
  ], record);
  assert.equal(resolved.status, "safe");
  if (resolved.status === "safe") assert.equal(resolved.pair.end?.occurredAt, "2026-09-20T09:00:00");
});

test("turno 04h longo continua pertencendo à data do início", () => {
  const dispatch = row();
  dispatch.driver.default_start_time = "04:00:00";
  const resolved = resolveJourneyForRecord([
    event("start-1", "start", "2026-09-19T04:30:00"),
    event("end-1", "end", "2026-09-20T00:20:00"),
  ], snapshotJourneyRecord(dispatch, "2026-09-19"));
  assert.equal(resolved.status, "safe");
});

test("duas jornadas consecutivas formam pares diferentes", () => {
  const paired = pairJourneyEvents([
    event("end-2", "end", "2026-09-21T08:50:00"),
    event("start-1", "start", "2026-09-19T20:10:00"),
    event("start-2", "start", "2026-09-20T20:15:00"),
    event("end-1", "end", "2026-09-20T09:00:00"),
  ]);
  assert.deepEqual(paired.reasons, []);
  assert.deepEqual(paired.pairs.map(pair => [pair.start.id, pair.end?.id]), [["start-1", "end-1"], ["start-2", "end-2"]]);
});

test("jornada aberta não reutiliza fim anterior", () => {
  const record = snapshotJourneyRecord(row(), "2026-09-20");
  const resolved = resolveJourneyForRecord([event("start-2", "start", "2026-09-20T04:30:00")], record);
  assert.equal(resolved.status, "safe");
  if (resolved.status === "safe") assert.equal(resolved.pair.end, null);
});

test("fim órfão e sequência com múltiplos inícios são ambíguos", () => {
  const record = snapshotJourneyRecord(row(), "2026-09-20");
  assert.equal(resolveJourneyForRecord([event("end", "end", "2026-09-20T09:00:00")], record).status, "ambiguous");
  assert.equal(resolveJourneyForRecord([
    event("start-1", "start", "2026-09-20T04:00:00"),
    event("start-2", "start", "2026-09-20T05:00:00"),
    event("end", "end", "2026-09-20T09:00:00"),
  ], record).status, "ambiguous");
});

test("fim da jornada anterior antes do início selecionado não contamina o novo par", () => {
  const record = snapshotJourneyRecord(row(), "2026-09-20");
  const resolved = resolveJourneyForRecord([
    event("previous-end", "end", "2026-09-20T09:00:00"),
    event("current-start", "start", "2026-09-20T20:15:00"),
    event("current-end", "end", "2026-09-21T08:50:00"),
  ], record);
  assert.equal(resolved.status, "safe");
  if (resolved.status === "safe") assert.equal(resolved.pair.end?.id, "current-end");
});

test("inícios separados por até um minuto usam o primeiro início", () => {
  const record = snapshotJourneyRecord(row(), "2026-09-16");
  const resolved = resolveJourneyForRecord([
    event("primeiro-inicio", "start", "2026-09-16T07:43:11"),
    event("confirmacao-proxima", "start", "2026-09-16T07:43:12"),
    event("fim", "end", "2026-09-16T15:02:25"),
  ], record);
  assert.equal(resolved.status, "safe");
  if (resolved.status === "safe") assert.equal(resolved.pair.start.id, "primeiro-inicio");
});

test("inícios separados por mais de um minuto continuam exigindo conferência", () => {
  const record = snapshotJourneyRecord(row(), "2026-09-16");
  const resolved = resolveJourneyForRecord([
    event("primeiro-inicio", "start", "2026-09-16T07:43:11"),
    event("inicio-distinto", "start", "2026-09-16T07:44:12"),
    event("fim", "end", "2026-09-16T15:02:25"),
  ], record);
  assert.equal(resolved.status, "ambiguous");
});

test("fins repetidos no mesmo instante usam o primeiro fim recebido", () => {
  const record = snapshotJourneyRecord(row(), "2026-09-20");
  const resolved = resolveJourneyForRecord([
    event("start", "start", "2026-09-20T04:00:00"),
    event("primeiro-fim", "end", "2026-09-20T15:02:25"),
    event("segundo-fim", "end", "2026-09-20T15:02:25"),
  ], record);
  assert.equal(resolved.status, "safe");
  if (resolved.status === "safe") assert.equal(resolved.pair.end?.id, "primeiro-fim");
});

test("fins separados por até cinco minutos usam o primeiro fim", () => {
  const record = snapshotJourneyRecord(row(), "2026-09-20");
  const resolved = resolveJourneyForRecord([
    event("start", "start", "2026-09-20T04:00:00"),
    event("primeiro-fim", "end", "2026-09-20T15:02:25"),
    event("confirmacao-proxima", "end", "2026-09-20T15:06:59"),
  ], record);
  assert.equal(resolved.status, "safe");
  if (resolved.status === "safe") assert.equal(resolved.pair.end?.id, "primeiro-fim");
});

test("fins realmente distintos continuam exigindo conferência", () => {
  const record = snapshotJourneyRecord(row(), "2026-09-20");
  const resolved = resolveJourneyForRecord([
    event("start", "start", "2026-09-20T04:00:00"),
    event("primeiro-fim", "end", "2026-09-20T15:02:25"),
    event("fim-distinto", "end", "2026-09-20T15:08:00"),
  ], record);
  assert.equal(resolved.status, "ambiguous");
});

test("valor manual divergente impede aplicação silenciosa", () => {
  const dispatch = row();
  dispatch.exit_time = "09:20:00";
  const record = snapshotJourneyRecord(dispatch, "2026-09-19");
  const resolution = resolveJourneyForRecord([
    event("start", "start", "2026-09-19T20:10:00"),
    event("end", "end", "2026-09-20T09:15:00"),
  ], record);
  const preview = buildJourneyPreview(record, resolution);
  assert.equal(preview.canApply, false);
  assert.deepEqual(preview.conflicts, [{ field: "exit_time", current: "09:20:00", sighra: "09:15:00" }]);
});

test("resposta atrasada resolve o João pelo recordId após reordenação", () => {
  const joao = row("abc", "JOÃO", "45778");
  const gabriel = row("xyz", "GABRIEL", "99001");
  const requested = snapshotJourneyRecord(joao, "2026-09-19");
  const resolved = resolveJourneyRecord([gabriel, joao], requested, "2026-09-19");
  assert.equal(resolved.row?.id, "abc");
  assert.equal(resolved.row?.driver.name, "JOÃO");
});

test("revalidação bloqueia troca de login, status ou data durante a consulta", () => {
  const requested = snapshotJourneyRecord(row(), "2026-09-19");
  assert.equal(resolveJourneyRecord([row("abc", "GABRIEL", "99001")], requested, "2026-09-19").row, null);
  assert.equal(resolveJourneyRecord([row("abc", "JOÃO", "45778", "BALDEIO")], requested, "2026-09-19").row, null);
  assert.equal(resolveJourneyRecord([row()], requested, "2026-09-20").row, null);
});
