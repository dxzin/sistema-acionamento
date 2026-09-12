import { Dispatch } from "@/types/database";

export function isAwaitingPreviousExit(
  previousDayDispatch?: Pick<Dispatch, "dispatch_status" | "exit_time"> | null
) {
  return Boolean(
    previousDayDispatch &&
    previousDayDispatch.dispatch_status.trim().toLocaleUpperCase("pt-BR") === "ACIONADO" &&
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
