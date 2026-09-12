import { DispatchRowModel } from "@/types/domain";
import { calculateJornada } from "./jornada";

export interface OperationalAlertSummary {
  acionadosSemEntrada: number;
  jornadasAbertas: number;
  abonosPendentes: number;
  jornadasAcimaDoLimite: number;
}

export function summarizeOperationalAlerts(rows: DispatchRowModel[], referenceNow?: string): OperationalAlertSummary {
  return rows.reduce<OperationalAlertSummary>((summary, row) => {
    const status = row.dispatch_status.trim().toLocaleUpperCase("pt-BR");
    const jornada = calculateJornada(row.entry_time, row.exit_time, referenceNow);

    if (status === "ACIONADO" && !row.entry_time) summary.acionadosSemEntrada += 1;
    if (row.entry_time && !row.exit_time) summary.jornadasAbertas += 1;
    if (status === "ABONADO" && row.abono_authorized_by === "PENDENTE") summary.abonosPendentes += 1;
    if (jornada.minutes !== null && jornada.minutes > 670) summary.jornadasAcimaDoLimite += 1;

    return summary;
  }, {
    acionadosSemEntrada: 0,
    jornadasAbertas: 0,
    abonosPendentes: 0,
    jornadasAcimaDoLimite: 0,
  });
}
