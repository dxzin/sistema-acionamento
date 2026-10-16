"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, RefreshCw, ShieldAlert, X } from "lucide-react";
import { summarizeJourneyBatch, type JourneyBatchItem } from "@/lib/sighra/journey-batch";

interface JourneyBatchDialogProps {
  items: JourneyBatchItem[];
  applying: boolean;
  error?: string | null;
  onApplySafe: () => void;
  onCancel: () => void;
  onClose: () => void;
  onRetryFailures: () => void;
}

const clock = (value: string | null | undefined) => value?.slice(0, 5) || "—";

const OUTCOME_LABELS = {
  pending: "Consultando",
  safe: "Seguro",
  unchanged: "Já preenchido",
  review: "Conferir",
  failed: "Falha",
} as const;

function detail(item: JourneyBatchItem) {
  if (item.outcome === "pending") return item.job?.status === "running" ? "Consulta em execução" : "Aguardando a ponte";
  if (item.outcome === "failed") return item.job?.error || "A consulta não foi concluída.";
  if (!item.preview) return "Sem resultado disponível.";
  const locationComparison = item.preview.endLocationComparison;
  const locationDetail = locationComparison?.status === "matched"
    ? " · Local conferido"
    : locationComparison?.status === "different"
      ? ` · Local diferente: SIGhRA ${locationComparison.actual} / planilha ${locationComparison.expected}`
      : locationComparison?.status === "unavailable"
        ? ` · Local SIGhRA não informado / planilha ${locationComparison.expected}`
        : "";
  if (item.preview.conflicts.length) {
    return item.preview.conflicts.map((conflict) =>
      `${conflict.field === "entry_time" ? "Entrada" : conflict.field === "exit_time" ? "Saída" : "Placa"}: atual ${conflict.field === "fleet_code" ? conflict.current : clock(conflict.current)} · SIGhRA ${conflict.field === "fleet_code" ? conflict.sighra : clock(conflict.sighra)}`
    ).join("; ");
  }
  if (item.preview.resolution.status !== "safe") return item.preview.resolution.message;
  if (item.outcome === "unchanged") return item.preview.preservedPlate
    ? `Horários já registrados · placa atual ${item.preview.preservedPlate.current} mantida${locationDetail}`
    : `Os dados encontrados já estão registrados.${locationDetail}`;
  const plate = item.preview.preservedPlate
    ? `mantida ${item.preview.preservedPlate.current}`
    : item.preview.changes.fleet_code || "—";
  return `Entrada ${clock(item.preview.changes.entry_time)} · Saída ${clock(item.preview.changes.exit_time)} · Placa ${plate}${locationDetail}`;
}

export function JourneyBatchDialog({ items, applying, error, onApplySafe, onCancel, onClose, onRetryFailures }: JourneyBatchDialogProps) {
  const summary = summarizeJourneyBatch(items);
  const running = summary.pending > 0;
  const progress = summary.total ? Math.round((summary.completed / summary.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[155] flex items-center justify-center bg-slate-950/55 p-3" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="journey-batch-title"
        aria-describedby="journey-batch-progress"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !applying) (running ? onCancel : onClose)();
        }}
        className="journey-batch-dialog flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden border border-slate-300 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-slate-200 bg-[#f3f3f3] px-4 py-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#217346]">Consulta SIGhRA em lote</span>
            <h2 id="journey-batch-title" className="text-base font-bold text-slate-900">Jornadas dos condutores</h2>
          </div>
          <button type="button" onClick={running ? onCancel : onClose} disabled={applying} aria-label={running ? "Cancelar consulta" : "Fechar resultado"} className="min-h-10 min-w-10 p-2 text-slate-500 hover:text-slate-900 disabled:opacity-50"><X aria-hidden="true" className="h-5 w-5" /></button>
        </header>

        <div className="border-b border-slate-200 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <strong id="journey-batch-progress" aria-live="polite">{summary.completed} de {summary.total} consultados</strong>
            <span className="font-mono font-bold text-slate-600">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={summary.total} aria-valuenow={summary.completed}>
            <div className="h-full bg-[#217346] transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[11px] sm:grid-cols-5">
            <span className="border border-slate-200 bg-slate-50 px-2 py-1.5"><b>{summary.pending}</b> pendentes</span>
            <span className="border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-emerald-900"><b>{summary.safe}</b> seguros</span>
            <span className="border border-sky-200 bg-sky-50 px-2 py-1.5 text-sky-900"><b>{summary.unchanged}</b> preenchidos</span>
            <span className="border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900"><b>{summary.review}</b> conferir</span>
            <span className="border border-rose-200 bg-rose-50 px-2 py-1.5 text-rose-900"><b>{summary.failed}</b> falhas</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase text-slate-600">
              <tr><th className="px-3 py-2">Condutor</th><th className="px-3 py-2">Login</th><th className="px-3 py-2">Resultado</th><th className="px-3 py-2">Detalhe</th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.record.recordId} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-2 font-semibold text-slate-900">{item.record.driverName}</td>
                  <td className="px-3 py-2 font-mono text-slate-700">{item.record.login}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 font-bold ${
                      item.outcome === "safe" ? "text-emerald-700" : item.outcome === "unchanged" ? "text-sky-700" :
                        item.outcome === "review" ? "text-amber-700" : item.outcome === "failed" ? "text-rose-700" : "text-slate-600"
                    }`}>
                      {item.outcome === "pending" ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : item.outcome === "safe" ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> : item.outcome === "review" ? <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" /> : item.outcome === "failed" ? <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" /> : <CircleDashed aria-hidden="true" className="h-3.5 w-3.5" />}
                      {OUTCOME_LABELS[item.outcome]}
                    </span>
                  </td>
                  <td className="max-w-md px-3 py-2 text-slate-600">{detail(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <p role="alert" className="mx-4 mt-3 border border-rose-300 bg-rose-50 p-2 text-xs font-semibold text-rose-800">{error}</p>}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-[#f8f8f8] px-4 py-3">
          <p className="text-[11px] text-slate-600">Valores manuais divergentes nunca são substituídos pelo lote.</p>
          <div className="flex flex-wrap justify-end gap-2">
            {!running && summary.failed > 0 && <button type="button" onClick={onRetryFailures} disabled={applying} className="flex min-h-10 items-center gap-1 border border-slate-400 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> Repetir falhas</button>}
            <button type="button" onClick={running ? onCancel : onClose} disabled={applying} className="min-h-10 border border-slate-400 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">{running ? "Cancelar consulta" : "Fechar"}</button>
            <button type="button" onClick={onApplySafe} disabled={running || summary.safe === 0 || applying} className="flex min-h-10 items-center gap-1 bg-[#217346] px-3 py-2 text-xs font-bold text-white hover:bg-[#185c37] disabled:cursor-not-allowed disabled:opacity-50">
              {applying && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />} Aplicar {summary.safe} jornada(s) segura(s)
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
