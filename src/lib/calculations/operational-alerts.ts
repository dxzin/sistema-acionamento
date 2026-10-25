import { DispatchRowModel } from "@/types/domain";
import { calculateJornada } from "./jornada";
import { assessJourneyClose } from "./journey-close-deadline";

export interface OperationalAlertSummary {
  acionadosSemEntrada: number;
  jornadasAbertas: number;
  abonosPendentes: number;
  jornadasAcimaDoLimite: number;
  fechamentosProximos: number;
  fechamentosAtrasados: number;
}

interface OperationalAlertOptions {
  referenceClock?: string;
  operationalDate?: string;
  referenceTimestamp?: number;
}

export function summarizeOperationalAlerts(
  rows: DispatchRowModel[],
  reference?: string | OperationalAlertOptions
): OperationalAlertSummary {
  const options = typeof reference === "string" ? { referenceClock: reference } : reference;
  return rows.reduce<OperationalAlertSummary>((summary, row) => {
    const status = row.dispatch_status.trim().toLocaleUpperCase("pt-BR");
    const jornada = calculateJornada(row.entry_time, row.exit_time, options?.referenceClock);
    const closing = options?.operationalDate
      ? assessJourneyClose(row, options.operationalDate, options.referenceTimestamp)
      : null;

    if (status === "ACIONADO" && !row.entry_time) summary.acionadosSemEntrada += 1;
    if (row.entry_time && !row.exit_time) summary.jornadasAbertas += 1;
    if (status === "ABONADO" && row.abono_authorized_by === "PENDENTE") summary.abonosPendentes += 1;
    if (jornada.minutes !== null && jornada.minutes > 670) summary.jornadasAcimaDoLimite += 1;
    if (closing?.risk === "warning" || closing?.risk === "urgent") summary.fechamentosProximos += 1;
    if (closing?.risk === "overdue") summary.fechamentosAtrasados += 1;

    return summary;
  }, {
    acionadosSemEntrada: 0,
    jornadasAbertas: 0,
    abonosPendentes: 0,
    jornadasAcimaDoLimite: 0,
    fechamentosProximos: 0,
    fechamentosAtrasados: 0,
  });
}
