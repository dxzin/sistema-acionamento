"use client";

import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import type { JourneyPreview } from "@/lib/sighra/journey";
import type { JourneyProviderKind } from "@/lib/sighra/journey-config";

interface JourneyPilotDialogProps {
  preview: JourneyPreview;
  provider: JourneyProviderKind;
  saving: boolean;
  error?: string | null;
  onApply: () => void;
  onCancel: () => void;
  onForceSearch: () => void;
}

const formatDate = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
const formatTimestamp = (value: string) => `${formatDate(value.slice(0, 10))} ${value.slice(11, 16)}`;
const formatClock = (value: string) => value.slice(0, 5);

export function JourneyPilotDialog({ preview, provider, saving, error, onApply, onCancel, onForceSearch }: JourneyPilotDialogProps) {
  const pair = preview.resolution.status === "safe" ? preview.resolution.pair : null;
  const manualEnd = preview.resolution.status === "manual_end" ? preview.resolution.end : null;
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="journey-pilot-title"
        className="w-full max-w-xl border border-slate-300 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-slate-200 bg-[#f3f3f3] px-4 py-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#217346]">Piloto local · {provider === "mock" ? "dados simulados" : "ponte SIGhRa"}</span>
            <h2 id="journey-pilot-title" className="text-base font-bold text-slate-900">Prévia da jornada</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Fechar prévia" className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-4 p-4 text-sm text-slate-800">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs">
            <div><dt className="font-bold text-slate-500">Condutor</dt><dd className="font-semibold">{preview.record.driverName}</dd></div>
            <div><dt className="font-bold text-slate-500">Login</dt><dd className="font-mono font-semibold">{preview.record.login}</dd></div>
            <div><dt className="font-bold text-slate-500">Data operacional</dt><dd>{formatDate(preview.record.operationalDate)}</dd></div>
            <div><dt className="font-bold text-slate-500">Turno</dt><dd>{preview.record.shift?.slice(0, 5) || "Não informado"}</dd></div>
            <div className="col-span-2"><dt className="font-bold text-slate-500">Registro imutável</dt><dd className="truncate font-mono text-[10px]" title={preview.record.recordId}>{preview.record.recordId}</dd></div>
          </dl>

          <div className={`flex gap-2 border p-3 ${preview.resolution.status === "safe" ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
            {preview.resolution.status === "safe" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />}
            <div>
              <strong>{preview.resolution.message}</strong>
              {preview.resolution.status !== "safe" && preview.resolution.reasons.map((reason) => <p key={reason} className="mt-1 text-xs">{reason}</p>)}
            </div>
          </div>

          {pair && (
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-slate-200 p-3">
                <span className="text-[10px] font-bold uppercase text-slate-500">Início SIGhRa</span>
                <p className="mt-1 font-mono text-base font-bold">{formatTimestamp(pair.start.occurredAt)}</p>
                <p className="mt-1 truncate font-mono text-[9px] text-slate-500" title={pair.start.id}>Macro {pair.start.id}</p>
              </div>
              <div className="border border-slate-200 p-3">
                <span className="text-[10px] font-bold uppercase text-slate-500">Fim SIGhRa</span>
                <p className="mt-1 font-mono text-base font-bold">{pair.end ? formatTimestamp(pair.end.occurredAt) : "Em andamento"}</p>
                {pair.end && <p className="mt-1 truncate font-mono text-[9px] text-slate-500" title={pair.end.id}>Macro {pair.end.id}</p>}
              </div>
            </div>
          )}
          {manualEnd && (
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-slate-200 p-3">
                <span className="text-[10px] font-bold uppercase text-slate-500">Entrada da planilha</span>
                <p className="mt-1 font-mono text-base font-bold">{formatDate(preview.record.operationalDate)} {formatClock(preview.record.entryTime || "")}</p>
                <p className="mt-1 text-[10px] text-slate-500">Mantida como foi preenchida; sem macro de início SIGhRa.</p>
              </div>
              <div className="border border-slate-200 p-3">
                <span className="text-[10px] font-bold uppercase text-slate-500">Fim SIGhRa</span>
                <p className="mt-1 font-mono text-base font-bold">{formatTimestamp(manualEnd.occurredAt)}</p>
                <p className="mt-1 truncate font-mono text-[9px] text-slate-500" title={manualEnd.id}>Macro {manualEnd.id}</p>
              </div>
            </div>
          )}
          {pair && <p className="border border-slate-200 bg-slate-50 p-2 text-xs">
            Placa: {pair.restart?.plate ? <><b>{pair.restart.plate}</b> · macro de reinício de viagem {formatTimestamp(pair.restart.occurredAt)}</> : "sem placa nas duas primeiras macros de reinício; os horários podem ser aplicados."}
          </p>}

          {preview.conflicts.length > 0 && (
            <div className="border border-rose-300 bg-rose-50 p-3">
              <strong className="text-rose-900">Já existe um valor manual divergente.</strong>
              {preview.conflicts.map((conflict) => (
                <p key={conflict.field} className="mt-1 text-xs text-rose-900">
                  {conflict.field === "entry_time" ? "Início" : conflict.field === "exit_time" ? "Fim" : "Placa"}: atual <b>{conflict.field === "fleet_code" ? conflict.current : formatClock(conflict.current)}</b> · SIGhRa <b>{conflict.field === "fleet_code" ? conflict.sighra : formatClock(conflict.sighra)}</b>
                </p>
              ))}
              <p className="mt-1 text-xs text-rose-800">O piloto não substitui esse valor.</p>
            </div>
          )}

          {pair && !preview.canApply && preview.conflicts.length === 0 && preview.resolution.status === "safe" && (
            <p className="border border-slate-200 bg-slate-50 p-2 text-xs">Os valores encontrados já estão preenchidos; não há alteração a aplicar.</p>
          )}
          {manualEnd && !preview.canApply && preview.conflicts.length === 0 && (
            <p className="border border-slate-200 bg-slate-50 p-2 text-xs">A saída encontrada já está preenchida; não há alteração a aplicar.</p>
          )}
          {error && <p role="alert" className="border border-rose-300 bg-rose-50 p-2 text-xs font-semibold text-rose-800">{error}</p>}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-[#f8f8f8] px-4 py-3">
          <button type="button" onClick={onForceSearch} disabled={saving} className="flex items-center gap-1 border border-slate-400 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
            <RefreshCw className="h-3.5 w-3.5" /> Forçar busca SIGhRa
          </button>
          <button type="button" onClick={onCancel} disabled={saving} className="border border-slate-400 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={onApply} disabled={!preview.canApply || saving} className="flex items-center gap-1 bg-[#217346] px-3 py-2 text-xs font-bold text-white hover:bg-[#185c37] disabled:cursor-not-allowed disabled:opacity-50">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Aplicar à planilha
          </button>
        </footer>
      </section>
    </div>
  );
}
