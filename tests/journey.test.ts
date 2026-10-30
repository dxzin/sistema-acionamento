import assert from "node:assert/strict";
import test from "node:test";
import type { DispatchRowModel } from "../src/types/domain";
import {
  buildJourneyPreview,
  canAutoApplyManualEnd,
  isJourneyEligible,
  isConfirmedManualEnd,
  journeyEndLocationMatches,
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

test("normaliza os locais conhecidos do fim de jornada", () => {
  assert.equal(journeyEndLocationMatches("BELLO PARKING · Av. das Torres · Uberaba / MG", "UBERABA"), true);
  assert.equal(journeyEndLocationMatches("TRANSAMERICA · Rodovia BR-050", "UBERABA"), true);
  assert.equal(journeyEndLocationMatches("Lençóis Paulista / SP", "LP"), true);
  assert.equal(journeyEndLocationMatches("Portaria BRACELL · SP-300", "LP"), true);
  assert.equal(journeyEndLocationMatches(
    "POSTO PIRAPATOS - PONTO DE APOIO · JUSCELINO KUBITSCHECK - BR 040 - MINAS GERAIS · LUIZLÂNDIA DO OESTE / MG",
    "LZ",
  ), true);
  assert.equal(journeyEndLocationMatches("TRANSAMERICA · Uberaba / MG", "LP"), false);
});

test("fim divergente do destino final é informativo e não bloqueia a aplicação", () => {
  const dispatch = row();
  dispatch.final_destination_name = "LP";
  const record = snapshotJourneyRecord(dispatch, "2026-09-19");
  const resolved = resolveJourneyForRecord([
    event("start", "start", "2026-09-19T04:00:00"),
    { ...event("end", "end", "2026-09-19T12:00:00"), location: "BELLO PARKING · Uberaba / MG" },
  ], record);
  const preview = buildJourneyPreview(record, resolved);
  assert.equal(resolved.status, "safe");
  assert.equal(preview.canApply, true);
  assert.deepEqual(preview.endLocationComparison, {
    status: "different",
    expected: "LP",
    actual: "BELLO PARKING · Uberaba / MG",
  });
});

test("destino final tem prioridade e destino é usado quando ele está vazio", () => {
  const withFinal = row();
  withFinal.destination_name = "UBERABA";
  withFinal.final_destination_name = "LP";
  assert.equal(snapshotJourneyRecord(withFinal, "2026-09-19").plannedEndLocation, "LP");

  const withoutFinal = row();
  withoutFinal.destination_name = "UBERABA";
  const record = snapshotJourneyRecord(withoutFinal, "2026-09-19");
  assert.equal(record.plannedEndLocation, "UBERABA");
  const resolved = resolveJourneyForRecord([
    event("start", "start", "2026-09-19T04:00:00"),
    { ...event("end", "end", "2026-09-19T12:00:00"), location: "TRANSAMERICA · Uberaba / MG" },
  ], record);
  assert.equal(resolved.status, "safe");
  const preview = buildJourneyPreview(record, resolved);
  assert.deepEqual(preview.endLocationComparison, {
    status: "matched",
    expected: "UBERABA",
    actual: "TRANSAMERICA · Uberaba / MG",
  });
});

test("fim sem localização não bloqueia o horário quando há local final na planilha", () => {
  const dispatch = row();
  dispatch.destination_name = "UBERABA";
  const record = snapshotJourneyRecord(dispatch, "2026-09-19");
  const resolved = resolveJourneyForRecord([
    event("start", "start", "2026-09-19T04:00:00"),
    event("end", "end", "2026-09-19T12:00:00"),
  ], record);
  const preview = buildJourneyPreview(record, resolved);
  assert.equal(resolved.status, "safe");
  assert.equal(preview.canApply, true);
  assert.deepEqual(preview.endLocationComparison, {
    status: "unavailable",
    expected: "UBERABA",
    actual: null,
  });
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

test("entrada preenchida permite aplicar somente o fim posterior quando falta macro de início", () => {
  const dispatch = row();
  dispatch.entry_time = "02:21:00";
  const record = snapshotJourneyRecord(dispatch, "2026-09-27");
  const preview = buildJourneyPreview(record, resolveJourneyForRecord([
    event("fim-anterior", "end", "2026-09-27T02:21:15"),
    { ...event("reinicio", "start", "2026-09-27T08:48:59"), type: "intermediate", name: "REINICIO DE VIAGEM", plate: "ABC1D23" },
    event("fim-atual", "end", "2026-09-27T15:05:05"),
  ], record));
  assert.equal(preview.resolution.status, "manual_end");
  assert.deepEqual(preview.changes, { exit_time: "15:05:00" });
  assert.equal(preview.canApply, true);
  assert.equal(canAutoApplyManualEnd(preview), true);
});

test("fim isolado exige entrada preenchida e não altera saída manual divergente", () => {
  const dispatch = row();
  dispatch.final_destination_name = "LP";
  const finish = { ...event("fim", "end", "2026-09-27T15:05:05"), location: "GARAGEM GARBUIO · LENÇÓIS PAULISTA/SP" };
  assert.equal(resolveJourneyForRecord([finish], snapshotJourneyRecord(dispatch, "2026-09-27")).status, "ambiguous");
  dispatch.entry_time = "04:00:00";
  dispatch.exit_time = "15:10:00";
  const record = snapshotJourneyRecord(dispatch, "2026-09-27");
  const preview = buildJourneyPreview(record, resolveJourneyForRecord([finish], record));
  assert.equal(preview.canApply, false);
  assert.deepEqual(preview.conflicts, [{ field: "exit_time", current: "15:10:00", sighra: "15:05:00" }]);
  assert.equal(canAutoApplyManualEnd(preview), false);
  dispatch.exit_time = "15:05:00";
  const filledRecord = snapshotJourneyRecord(dispatch, "2026-09-27");
  const filledPreview = buildJourneyPreview(filledRecord, resolveJourneyForRecord([finish], filledRecord));
  assert.equal(filledPreview.resolution.status, "manual_end");
  assert.deepEqual(filledPreview.changes, {});
  assert.equal(filledPreview.canApply, false);
  assert.equal(canAutoApplyManualEnd(filledPreview), false);
  assert.equal(isConfirmedManualEnd(filledPreview), true);
});

test("dois fins posteriores à entrada continuam exigindo conferência", () => {
  const dispatch = row();
  dispatch.entry_time = "04:00:00";
  const record = snapshotJourneyRecord(dispatch, "2026-09-27");
  assert.equal(resolveJourneyForRecord([
    event("fim-um", "end", "2026-09-27T09:00:00"),
    event("fim-dois", "end", "2026-09-27T15:05:05"),
  ], record).status, "ambiguous");
});

test("entrada manual à noite aceita fim único no dia seguinte", () => {
  const dispatch = row();
  dispatch.entry_time = "20:00:00";
  const record = snapshotJourneyRecord(dispatch, "2026-09-27");
  const preview = buildJourneyPreview(record, resolveJourneyForRecord([
    event("fim", "end", "2026-09-28T08:10:00"),
  ], record));
  assert.equal(preview.resolution.status, "manual_end");
  assert.deepEqual(preview.changes, { exit_time: "08:10:00" });
});

test("fim depois do início SIGhRa de outra jornada não fecha a entrada manual", () => {
  const dispatch = row();
  dispatch.entry_time = "20:00:00";
  const record = snapshotJourneyRecord(dispatch, "2026-09-27");
  assert.equal(resolveJourneyForRecord([
    event("novo-inicio", "start", "2026-09-28T04:00:00"),
    event("fim-novo", "end", "2026-09-28T12:00:00"),
  ], record).status, "ambiguous");
});

test("fim da carona antes de novo início SIGhRa preenche só a saída anterior", () => {
  const dispatch = row();
  dispatch.entry_time = "04:00:00";
  const record = snapshotJourneyRecord(dispatch, "2026-09-27");
  const preview = buildJourneyPreview(record, resolveJourneyForRecord([
    event("fim-carona", "end", "2026-09-27T15:05:05"),
    event("novo-inicio", "start", "2026-09-27T20:00:00"),
    event("fim-novo", "end", "2026-09-28T08:00:00"),
  ], record));
  assert.equal(preview.resolution.status, "manual_end");
  assert.deepEqual(preview.changes, { exit_time: "15:05:00" });
});

test("jornada SIGhRa encerrada antes da entrada manual não captura o fim da carona", () => {
  const dispatch = row();
  dispatch.entry_time = "04:00:00";
  const record = snapshotJourneyRecord(dispatch, "2026-09-27");
  const preview = buildJourneyPreview(record, resolveJourneyForRecord([
    event("inicio-antigo", "start", "2026-09-27T00:30:00"),
    event("fim-antigo", "end", "2026-09-27T02:21:15"),
    event("fim-carona", "end", "2026-09-27T15:05:05"),
  ], record));
  assert.equal(preview.resolution.status, "manual_end");
  assert.deepEqual(preview.changes, { exit_time: "15:05:00" });
});

test("início SIGhRa ainda aberto na hora da entrada impede fim isolado", () => {
  const dispatch = row();
  dispatch.entry_time = "04:00:00";
  const record = snapshotJourneyRecord(dispatch, "2026-09-27");
  assert.notEqual(resolveJourneyForRecord([
    event("inicio", "start", "2026-09-27T03:00:00"),
    event("fim", "end", "2026-09-27T15:05:05"),
  ], record).status, "manual_end");
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

test("início GA seguido por início padrão mantém o primeiro início no lote", () => {
  const record = snapshotJourneyRecord(row(), "2026-09-16");
  const resolved = resolveJourneyForRecord([
    { ...event("primeiro-inicio-ga", "start", "2026-09-16T18:56:47"), name: "INÍCIO DE JORNADA GA" },
    { ...event("aguardando-frota", "start", "2026-09-16T18:57:26"), name: "AGUARDANDO FROTA", type: "intermediate" },
    event("inicio-padrao-posterior", "start", "2026-09-16T23:47:00"),
    event("fim", "end", "2026-09-17T03:08:42"),
  ], record);
  assert.equal(resolved.status, "safe");
  if (resolved.status === "safe") {
    assert.equal(resolved.pair.start.id, "primeiro-inicio-ga");
    assert.equal(resolved.pair.end?.id, "fim");
  }
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

test("placa vem somente do primeiro ou segundo reinício após o início da jornada", () => {
  const record = snapshotJourneyRecord(row(), "2026-09-19");
  const events = [
    { ...event("anterior", "start", "2026-09-19T03:00:00"), type: "intermediate" as const, name: "REINÍCIO DE VIAGEM", plate: "ANT1A11" },
    { ...event("start", "start", "2026-09-19T04:00:00"), plate: "INI1A11" },
    { ...event("primeiro", "start", "2026-09-19T04:10:00"), type: "intermediate" as const, name: "REINÍCIO DE VIAGEM", plate: null },
    { ...event("segundo", "start", "2026-09-19T04:20:00"), type: "intermediate" as const, name: "REINICIO DE VIAGEM", plate: "SEG1A22" },
    { ...event("terceiro", "start", "2026-09-19T04:30:00"), type: "intermediate" as const, name: "REINICIO DE VIAGEM", plate: "TER1A33" },
    { ...event("end", "end", "2026-09-19T12:00:00"), plate: "FIM1A44" },
  ];
  const preview = buildJourneyPreview(record, resolveJourneyForRecord(events, record));
  assert.equal(preview.resolution.status, "safe");
  assert.deepEqual(preview.changes, { entry_time: "04:00:00", exit_time: "12:00:00", fleet_code: "SEG1A22" });
});

test("sem reinício de viagem, início e fim continuam aplicáveis sem placa", () => {
  const record = snapshotJourneyRecord(row(), "2026-09-19");
  const preview = buildJourneyPreview(record, resolveJourneyForRecord([
    { ...event("start", "start", "2026-09-19T04:00:00"), plate: "INI1A11" },
    { ...event("end", "end", "2026-09-19T12:00:00"), plate: "FIM1A44" },
  ], record));
  assert.deepEqual(preview.changes, { entry_time: "04:00:00", exit_time: "12:00:00" });
  assert.equal(preview.canApply, true);
});

test("não usa a terceira macro de reinício nem uma macro posterior ao fim", () => {
  const record = snapshotJourneyRecord(row(), "2026-09-19");
  const restarts = ["04:10:00", "04:20:00", "04:30:00", "12:10:00"].map((time, index) => ({
    ...event(`restart-${index}`, "start", `2026-09-19T${time}`),
    type: "intermediate" as const, name: "REINICIO DE VIAGEM", plate: index < 2 ? null : "ABC1D23",
  }));
  const preview = buildJourneyPreview(record, resolveJourneyForRecord([
    event("start", "start", "2026-09-19T04:00:00"),
    ...restarts,
    event("end", "end", "2026-09-19T12:00:00"),
  ], record));
  assert.deepEqual(preview.changes, { entry_time: "04:00:00", exit_time: "12:00:00" });
});

test("placa preenchida é preservada e não bloqueia o fim de jornada", () => {
  const dispatch = row();
  dispatch.fleet_code = "MAN1A11";
  dispatch.entry_time = "12:06:00";
  const record = snapshotJourneyRecord(dispatch, "2026-09-27");
  const preview = buildJourneyPreview(record, resolveJourneyForRecord([
    event("start", "start", "2026-09-27T12:06:00"),
    { ...event("restart", "start", "2026-09-27T12:57:00"), type: "intermediate", name: "REINICIO DE VIAGEM", plate: "SIG1A22" },
    event("end", "end", "2026-09-28T03:36:00"),
  ], record));
  assert.equal(preview.canApply, true);
  assert.deepEqual(preview.changes, { exit_time: "03:36:00" });
  assert.deepEqual(preview.conflicts, []);
  assert.deepEqual(preview.preservedPlate, { current: "MAN1A11", sighra: "SIG1A22" });
});

test("saída divergente continua bloqueada mesmo com placa preservada", () => {
  const dispatch = row();
  dispatch.fleet_code = "MAN1A11";
  dispatch.exit_time = "04:00:00";
  const record = snapshotJourneyRecord(dispatch, "2026-09-19");
  const preview = buildJourneyPreview(record, resolveJourneyForRecord([
    event("start", "start", "2026-09-19T04:00:00"),
    { ...event("restart", "start", "2026-09-19T04:10:00"), type: "intermediate", name: "REINICIO DE VIAGEM", plate: "SIG1A22" },
    event("end", "end", "2026-09-19T12:00:00"),
  ], record));
  assert.equal(preview.canApply, false);
  assert.deepEqual(preview.conflicts, [{ field: "exit_time", current: "04:00:00", sighra: "12:00:00" }]);
  assert.deepEqual(preview.preservedPlate, { current: "MAN1A11", sighra: "SIG1A22" });
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
