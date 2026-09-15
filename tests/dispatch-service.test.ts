import assert from "node:assert/strict";
import test from "node:test";
import { dispatchService, isDispatchExcludedScaleCode } from "../src/lib/services/dispatch-service";

test("F, FE e DESL não entram no acionamento", () => {
  for (const code of ["F", "FE", "DESL", " desl "]) {
    assert.equal(isDispatchExcludedScaleCode(code), true);
  }

  for (const code of ["1", "6", "AT", "AF", ""]) {
    assert.equal(isDispatchExcludedScaleCode(code), false);
  }
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
