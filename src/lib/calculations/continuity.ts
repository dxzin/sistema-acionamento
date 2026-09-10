import { Dispatch } from "@/types/database";

/**
 * Motor de Continuidade Diária (Herança D-1 -> D):
 * - PREVISÃO de hoje = PREV PRÓX. DIA de ontem
 * - LOCAL de hoje = DESTINO FINAL (ou DESTINO) de ontem
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
    originLocationId:
      previousDayDispatch.final_destination_location_id ||
      previousDayDispatch.destination_location_id ||
      null,
  };
}
