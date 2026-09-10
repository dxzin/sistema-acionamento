import { minutesToTime, timeToMinutes } from "./jornada";

/**
 * Cálculo da Próxima Previsão de Acionamento:
 * PREV PRÓX. DIA = SAÍDA + Interjornada (padrão 11h10min = 670 minutos)
 */
export function calculateNextForecast(
  exitTime: string | null | undefined,
  interjornadaMinutes: number = 670
): string | null {
  if (!exitTime || exitTime.trim() === "") {
    return null;
  }

  const exitMinutes = timeToMinutes(exitTime.trim());
  const nextMinutes = (exitMinutes + interjornadaMinutes) % 1440;
  return minutesToTime(nextMinutes);
}
