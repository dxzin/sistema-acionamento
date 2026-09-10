/**
 * Utilitários de conversão de tempo e minutos
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(":").map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;
  return hours * 60 + minutes + Math.round(seconds / 60);
}

export function minutesToTime(totalMinutes: number): string {
  if (isNaN(totalMinutes) || totalMinutes < 0) return "--:--";
  const normalized = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

export function formatMinutesToDuration(totalMinutes: number | null | undefined): string {
  if (totalMinutes === null || totalMinutes === undefined || isNaN(totalMinutes)) {
    return "";
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getCurrentTimeFormatted(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/**
 * Cálculo rigoroso de jornada de trabalho conforme mapeamento da planilha:
 * - Jornada diurna normal (SAÍDA >= ENTRADA): SAÍDA - ENTRADA
 * - Jornada noturna atravessando a meia-noite (SAÍDA < ENTRADA): (23:59:59 - ENTRADA) + SAÍDA + 00:00:01
 * - Jornada em andamento (SAÍDA vazia): NOW() - ENTRADA
 */
export function calculateJornada(
  entryTime: string | null | undefined,
  exitTime: string | null | undefined,
  referenceNow?: string
): {
  minutes: number | null;
  formatted: string;
  isOvernight: boolean;
  isOngoing: boolean;
} {
  if (!entryTime || entryTime.trim() === "") {
    return { minutes: null, formatted: "", isOvernight: false, isOngoing: false };
  }

  const cleanEntry = entryTime.trim();
  const entryMinutes = timeToMinutes(cleanEntry);

  // Caso 1: Jornada em andamento (Saída vazia)
  if (!exitTime || exitTime.trim() === "") {
    const nowStr = referenceNow || getCurrentTimeFormatted();
    const nowMinutes = timeToMinutes(nowStr);
    let workedMinutes: number;

    if (nowMinutes >= entryMinutes) {
      workedMinutes = nowMinutes - entryMinutes;
    } else {
      // Cruzou a meia-noite em andamento
      workedMinutes = 1440 - entryMinutes + nowMinutes;
    }

    return {
      minutes: workedMinutes,
      formatted: formatMinutesToDuration(workedMinutes),
      isOvernight: nowMinutes < entryMinutes,
      isOngoing: true,
    };
  }

  // Caso 2: Jornada encerrada
  const cleanExit = exitTime.trim();
  const exitMinutes = timeToMinutes(cleanExit);

  if (exitMinutes >= entryMinutes) {
    // Jornada diurna normal
    const worked = exitMinutes - entryMinutes;
    return {
      minutes: worked,
      formatted: formatMinutesToDuration(worked),
      isOvernight: false,
      isOngoing: false,
    };
  } else {
    // Jornada noturna (atravessou a meia-noite)
    // Fórmula Excel: (23:59:59 - ENTRADA) + SAÍDA + 00:00:01 = 24h - ENTRADA + SAÍDA
    const worked = 1440 - entryMinutes + exitMinutes;
    return {
      minutes: worked,
      formatted: formatMinutesToDuration(worked),
      isOvernight: true,
      isOngoing: false,
    };
  }
}
