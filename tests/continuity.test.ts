import test from "node:test";
import assert from "node:assert/strict";
import { isAwaitingPreviousExit, resolveDayContinuity, shouldRefreshContinuityOrigin, resolveAutomaticForecast, matchesDispatchStatus } from "../src/lib/calculations/continuity";

test("status de trabalho seguem a continuidade e aguardam saída", () => {
  for (const status of ["ACIONADO", "APOIO", "TROCA", "BALDEIO", "VIAGEM FECHADA", " apoio "]) {
    assert.equal(resolveAutomaticForecast(previousDispatch({ dispatch_status: status, exit_time: null, next_day_forecast_time: "10:00:00" }), "04:00"), null);
    assert.equal(resolveAutomaticForecast(previousDispatch({ dispatch_status: status, exit_time: "18:00", next_day_forecast_time: "05:10:00" }), "04:00", true), "05:10:00");
  }
});

test("demais status ignoram previsão anterior e usam turno menos quatro horas", () => {
  for (const status of ["", "ABONADO", "FALTA", "ATESTADO", "AFASTADO", "BATE E VOLTA"]) {
    assert.equal(resolveAutomaticForecast(previousDispatch({ dispatch_status: status, next_day_forecast_time: "10:00:00" }), "04:00"), "00:00:00");
  }
  assert.equal(resolveAutomaticForecast(null, "12:00"), "08:00:00");
  assert.equal(resolveAutomaticForecast(null, "VF", true), null);
});

test("filtro Vazio inclui somente status ainda não preenchidos", () => {
  for (const status of ["", "  ", null, undefined]) assert.equal(matchesDispatchStatus(status, "__EMPTY__"), true);
  assert.equal(matchesDispatchStatus("APOIO", "__EMPTY__"), false);
  assert.equal(matchesDispatchStatus("", ""), true);
  assert.equal(matchesDispatchStatus(" apoio ", "APOIO"), true);
});
import type { Dispatch } from "../src/types/database";

function previousDispatch(values: Partial<Dispatch>): Dispatch {
  return {
    id: "dispatch-previous",
    daily_sheet_id: "sheet-previous",
    driver_id: "driver-1",
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
    observations: null,
    scale_day_status: null,
    total_worked_minutes: null,
    next_day_forecast_time: null,
    created_at: "2026-09-10T00:00:00.000Z",
    updated_at: "2026-09-10T00:00:00.000Z",
    ...values,
  };
}

test("herda previsão e somente o destino final do dia anterior", () => {
  const result = resolveDayContinuity("driver-1", previousDispatch({
    destination_location_id: "destino-normal",
    final_destination_location_id: "destino-final",
    next_day_forecast_time: "08:10:00",
  }));

  assert.deepEqual(result, {
    forecastStartTime: "08:10:00",
    originLocationId: "destino-final",
  });
});

test("não usa destino normal quando destino final está vazio", () => {
  const result = resolveDayContinuity("driver-1", previousDispatch({
    destination_location_id: "destino-normal",
    final_destination_location_id: null,
  }));

  assert.equal(result.originLocationId, null);
});

test("retorna continuidade vazia quando não existe dia anterior", () => {
  assert.deepEqual(resolveDayContinuity("driver-1", null), {
    forecastStartTime: null,
    originLocationId: null,
  });
});

test("atualiza origem automática quando o destino final anterior muda", () => {
  assert.equal(shouldRefreshContinuityOrigin("CONTINUITY", "origem-antiga", "origem-correta"), true);
});

test("preserva origem digitada manualmente pelo operador", () => {
  assert.equal(shouldRefreshContinuityOrigin("MANUAL", "origem-manual", "origem-correta"), false);
});

test("limpa origem automática quando o destino final anterior é apagado", () => {
  assert.equal(shouldRefreshContinuityOrigin("CONTINUITY", "origem-antiga", null), true);
});

test("aguarda a saída quando o condutor foi acionado", () => {
  assert.equal(isAwaitingPreviousExit(previousDispatch({ dispatch_status: "ACIONADO", exit_time: null })), true);
});

test("não bloqueia a previsão depois que a saída foi preenchida", () => {
  assert.equal(isAwaitingPreviousExit(previousDispatch({ dispatch_status: "ACIONADO", exit_time: "18:00:00" })), false);
});
