import { Dispatch } from "@/types/database";
import { resolveFirstDayForecast } from "./first-day-origin";

export function usesWorkingContinuity(status: string | null | undefined) {
  return ["ACIONADO", "APOIO", "TROCA", "BALDEIO", "VIAGEM FECHADA"].includes((status || "").trim().toLocaleUpperCase("pt-BR"));
}

export function resolveAutomaticForecast(previous: Dispatch | null | undefined, shiftTime: string | null | undefined, isClosedTrip = false) {
  if (!usesWorkingContinuity(previous?.dispatch_status)) return isClosedTrip ? null : resolveFirstDayForecast("1", shiftTime);
  return isAwaitingPreviousExit(previous) ? null : previous?.next_day_forecast_time || null;
}

export function matchesDispatchStatus(status: string | null | undefined, filter: string) {
  const normalized = (status || "").trim().toLocaleUpperCase("pt-BR");
  return !filter || (filter === "__EMPTY__" ? normalized === "" : normalized === filter);
}

export function resolvePreviousAbono(previous: Pick<Dispatch, "dispatch_status"> | null | undefined, shiftTime: string | null | undefined, isClosedTrip = false) {
  const wasAbonado = previous?.dispatch_status.trim().toLocaleUpperCase("pt-BR") === "ABONADO";
  return {
    wasAbonado,
    forecastStartTime: wasAbonado && !isClosedTrip ? resolveFirstDayForecast("1", shiftTime) : null,
    abonoReason: wasAbonado ? "Abonado ontem" : null,
  };
}

export function isAwaitingPreviousExit(
  previousDayDispatch?: Pick<Dispatch, "dispatch_status" | "exit_time"> | null
) {
  return Boolean(
    previousDayDispatch &&
    usesWorkingContinuity(previousDayDispatch.dispatch_status) &&
    !previousDayDispatch.exit_time
  );
}

/**
 * Motor de Continuidade Diária (Herança D-1 -> D):
 * - PREVISÃO de hoje = PREV PRÓX. DIA de ontem
 * - LOCAL de hoje = DESTINO FINAL de ontem
 * O destino intermediário nunca deve ser usado como origem do dia seguinte.
 */
export function resolveDayContinuity(
  driverId: string,
  previousDayDispatch?: Dispatch | null
): {
  forecastStartTime: string | null;
  originLocationId: string | null;
} {
  if (!previousDayDispatch) {
    return {
      forecastStartTime: null,
      originLocationId: null,
    };
  }

  return {
    forecastStartTime: previousDayDispatch.next_day_forecast_time || null,
    originLocationId: previousDayDispatch.final_destination_location_id || null,
  };
}

/**
 * Uma origem calculada pode acompanhar correções feitas no DESTINO FINAL de D-1.
 * Uma origem digitada pelo operador é definitiva e nunca é sobrescrita.
 */
export function shouldRefreshContinuityOrigin(
  originSource: Dispatch["origin_source"],
  currentOriginId: string | null | undefined,
  expectedOriginId: string | null | undefined
) {
  return originSource !== "MANUAL" &&
    (currentOriginId || null) !== (expectedOriginId || null);
}
