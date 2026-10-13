import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchService,
  isExpiredJwtError,
  isDispatchExcludedScaleCode,
  isDriverActiveForDispatch,
  regionsForDispatchSelection,
} from "../src/lib/services/dispatch-service";

test("reconhece expiração de JWT sem confundir erros operacionais", () => {
  assert.equal(isExpiredJwtError({ message: "JWT expired" }), true);
  assert.equal(isExpiredJwtError({ message: "token expirado" }), true);
  assert.equal(isExpiredJwtError({ message: "DAILY_SHEET_CLOSED" }), false);
});

test("VF entra como trabalho e F, FE, AF, DES e DESL não entram no acionamento", () => {
  for (const code of ["F", "FE", "AF", "DES", "DESL", " af ", " des ", " desl "]) {
    assert.equal(isDispatchExcludedScaleCode(code), true);
  }

  for (const code of ["1", "6", "VF", " vf ", "AT", "SATD", ""]) {
    assert.equal(isDispatchExcludedScaleCode(code), false);
  }

  assert.deepEqual(
    ["VF", "VF", "VF", "VF", "F"].map((code) => !isDispatchExcludedScaleCode(code)),
    [true, true, true, true, false],
  );
});

test("condutor inativo não entra no acionamento", () => {
  assert.equal(isDriverActiveForDispatch({ is_active: true }), true);
  assert.equal(isDriverActiveForDispatch({ is_active: false }), false);
  assert.equal(isDriverActiveForDispatch(undefined), false);
});

test("Todas as Operações consulta conjuntamente São Paulo e Minas Gerais", () => {
  assert.deepEqual(regionsForDispatchSelection("ALL"), ["SP", "UBJP"]);
  assert.deepEqual(regionsForDispatchSelection("SP"), ["SP"]);
  assert.deepEqual(regionsForDispatchSelection("UBJP"), ["UBJP"]);
});

test("local digitado livremente é resolvido e marcado como manual", async () => {
  const saved = await dispatchService.updateDispatch("disp-1", { origin_name: "  novo local  " });
  assert.ok(saved?.origin_location_id);
  assert.equal(saved.origin_source, "MANUAL");
});

test("editar somente a entrada preserva a saída existente no cálculo", async () => {
  const saved = await dispatchService.updateDispatch("disp-1", { entry_time: "02:00:00" });
  assert.ok(saved);
  assert.equal(saved.exit_time, "10:50:00");
  assert.equal(saved.total_worked_minutes, 530);
});

test("editar somente a saída preserva a entrada e recalcula a próxima previsão", async () => {
  const saved = await dispatchService.updateDispatch("disp-2", { exit_time: "13:19:00" });
  assert.ok(saved);
  assert.equal(saved.entry_time, "01:19:00");
  assert.equal(saved.total_worked_minutes, 720);
  assert.equal(saved.next_day_forecast_time, "00:29:00");
});

test("previsão digitada pelo operador fica protegida como manual", async () => {
  const saved = await dispatchService.updateDispatch("disp-3", { forecast_start_time: "09:15:00" });
  assert.ok(saved);
  assert.equal(saved.forecast_start_time, "09:15:00");
  assert.equal(saved.forecast_source, "MANUAL");
});

test("entrada provisória aceita sequência e não calcula jornada até receber horário", async () => {
  const sequence = await dispatchService.updateDispatch("disp-1", { entry_time: "2°" });
  assert.equal(sequence?.entry_time, "2°");
  assert.equal(sequence?.total_worked_minutes, null);
  const realEntry = await dispatchService.updateDispatch("disp-1", { entry_time: "02:00:00" });
  assert.equal(realEntry?.total_worked_minutes, 530);
});
