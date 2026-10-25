"use client";

import React from "react";
import { DispatchFilterOptions } from "@/types/domain";
import { Calendar, CloudOff, Download, LockKeyhole, LockOpen, RefreshCw, Search, UsersRound, Wifi } from "lucide-react";
import { OperatorPresence, SheetStatus } from "@/types/database";
import { nextOperationalDate } from "@/lib/dates/operational-date";

interface DispatchFiltersProps {
  filters: DispatchFilterOptions;
  onFilterChange: (newFilters: Partial<DispatchFilterOptions>) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  sheetStatus: SheetStatus | null;
  onToggleSheetStatus: () => void;
  isChangingSheetStatus?: boolean;
  onlineOperators?: OperatorPresence[];
  currentUserId?: string;
  syncStatus?: "live" | "fallback" | "offline";
  onExport: (startDate: string, endDate: string) => void;
  isExporting?: boolean;
}

export function DispatchFilters({
  filters,
  onFilterChange,
  onRefresh,
  isLoading = false,
  sheetStatus,
  onToggleSheetStatus,
  isChangingSheetStatus = false,
  onlineOperators = [],
  currentUserId,
  syncStatus = "fallback",
  onExport,
  isExporting = false,
}: DispatchFiltersProps) {
  const [showExportDialog, setShowExportDialog] = React.useState(false);
  const [exportStartDate, setExportStartDate] = React.useState(filters.date);
  const [exportEndDate, setExportEndDate] = React.useState(filters.date);
  const maximumDate = nextOperationalDate();
  const exportStartTime = Date.parse(`${exportStartDate}T00:00:00Z`);
  const exportEndTime = Date.parse(`${exportEndDate}T00:00:00Z`);
  const exportDayCount = Number.isFinite(exportStartTime) && Number.isFinite(exportEndTime)
    ? Math.floor((exportEndTime - exportStartTime) / 86_400_000) + 1
    : 0;
  const exportRangeError = exportDayCount < 1
    ? "A data final deve ser igual ou posterior à inicial."
    : exportDayCount > 31 ? "Selecione no máximo 31 dias por arquivo." : null;

  return (
    <div className="excel-toolbar wv-filter-bar p-1 text-xs">
      {/* Busca e Filtros Rápidos */}
      <div className="wv-filter-fields">
        {/* Campo de Busca por Condutor ou Matrícula */}
        <div className="relative min-w-[240px] max-w-[340px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por Condutor ou Login..."
            value={filters.searchQuery}
            onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-100 placeholder-slate-400 text-xs focus:outline-none focus:border-emerald-500 font-sans"
          />
        </div>

        {/* Seletor de Data */}
        <div className="flex items-center space-x-1 bg-slate-900 border border-slate-700 rounded px-2 py-1">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="date"
            value={filters.date}
            max={nextOperationalDate()}
            onChange={(e) => onFilterChange({ date: e.target.value })}
            className="bg-transparent text-slate-200 text-xs focus:outline-none font-mono cursor-pointer"
          />
        </div>

        {/* Filtro de Operação / Região */}
        <select
          value={filters.region}
          onChange={(e) => onFilterChange({ region: e.target.value as "SP" | "UBJP" | "ALL" })}
          className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-emerald-500 font-semibold cursor-pointer"
        >
          <option value="SP">Operação SP (Lençóis Paulista / Castilho)</option>
          <option value="UBJP">Operação MG (Uberaba / Luizlândia / JP)</option>
          <option value="ALL">Todas as Operações</option>
        </select>

        {/* Filtro de Status de Acionamento */}
        <select
          value={filters.statusFilter}
          onChange={(e) => onFilterChange({ statusFilter: e.target.value })}
          className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
        >
          <option value="">Todos os Status</option>
          <option value="ACIONADO">ACIONADO</option>
          <option value="ABONADO">ABONADO</option>
          <option value="APOIO">APOIO</option>
          <option value="BALDEIO">BALDEIO</option>
          <option value="TROCA">TROCA</option>
          <option value="FALTA">FALTA</option>
          <option value="ATESTADO">ATESTADO</option>
          <option value="AFASTADO">AFASTADO</option>
          <option value="BATE E VOLTA">BATE E VOLTA</option>
          <option value="SUSPENSÃO">SUSPENSÃO</option>
          <option value="VIAGEM FECHADA">VIAGEM FECHADA</option>
        </select>

        {/* Filtro de Turno / Horário */}
        <select
          value={filters.shiftFilter}
          onChange={(e) => onFilterChange({ shiftFilter: e.target.value })}
          className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
        >
          <option value="">Todos os Turnos</option>
          <option value="A">Turno A (04:00)</option>
          <option value="B">Turno B (12:00)</option>
          <option value="C">Turno C (20:00)</option>
        </select>

      </div>

      <div className="wv-filter-footer">
        <div className="excel-presence-strip flex min-h-7 items-center gap-1.5" aria-label="Operadores online nesta planilha">
          <UsersRound className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[10px] font-bold text-slate-300">Online</span>
          {onlineOperators.length ? onlineOperators.map((operator) => (
            <span
              key={operator.user_id}
              className={`excel-presence-chip ${operator.user_id === currentUserId ? "is-self" : ""}`}
              title={`${operator.display_name} — ${operator.email}${operator.active_dispatch_id ? " — selecionando uma linha" : ""}`}
            >
              <i aria-hidden="true" />
              {operator.email}
              {operator.user_id === currentUserId ? " (você)" : ""}
            </span>
          )) : (
            <span className="text-[10px] text-slate-400">conectando…</span>
          )}
        </div>

        {/* Botão de Atualização / Recálculo */}
        <div className="wv-filter-actions flex items-center space-x-2">
        <span
          className={`excel-sync-indicator is-${syncStatus}`}
          title={syncStatus === "live" ? "Alterações chegam em tempo real" : syncStatus === "fallback" ? "Rede bloqueou o tempo real; usando verificação automática rápida" : "Sem conexão com a internet"}
        >
          {syncStatus === "offline" ? <CloudOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
          {syncStatus === "live" ? "Ao vivo" : syncStatus === "fallback" ? "Sincronização de segurança" : "Offline"}
        </span>
        {sheetStatus && (
          <button
            type="button"
            onClick={onToggleSheetStatus}
            disabled={isLoading || isChangingSheetStatus}
            className={`flex items-center space-x-1 border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
              sheetStatus === "OPEN"
                ? "border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200"
                : "border-emerald-500 bg-emerald-700 text-white hover:bg-emerald-600"
            }`}
            title={sheetStatus === "OPEN" ? "Fechar e bloquear esta folha" : "Reabrir esta folha para edição"}
          >
            {sheetStatus === "OPEN" ? <LockKeyhole className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
            <span>{sheetStatus === "OPEN" ? "Fechar folha" : "Reabrir folha"}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setExportStartDate(filters.date);
            setExportEndDate(filters.date);
            setShowExportDialog(true);
          }}
          disabled={isLoading || isExporting}
          className="flex items-center space-x-1 border border-emerald-600 bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          title="Exportar exatamente as linhas visíveis para Excel"
        >
          <Download className="h-3.5 w-3.5" />
          <span>{isExporting ? "Gerando…" : "Exportar Excel"}</span>
        </button>
        {showExportDialog && (
          <div
            className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !isExporting) setShowExportDialog(false);
            }}
          >
            <div role="dialog" aria-modal="true" aria-label="Exportar período de acionamento" className="w-full max-w-md border border-slate-500 bg-slate-900 p-4 text-slate-100 shadow-2xl">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold">Exportar planilhas de acionamento</h2>
                  <p className="mt-1 text-[11px] text-slate-300">O arquivo terá uma aba para cada dia do período.</p>
                </div>
                <button type="button" onClick={() => setShowExportDialog(false)} disabled={isExporting} className="px-2 py-1 text-slate-300 hover:bg-slate-800" aria-label="Fechar exportação">×</button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
                  Data inicial
                  <input aria-label="Data inicial da exportação" type="date" value={exportStartDate} max={maximumDate} onChange={(event) => setExportStartDate(event.target.value)} className="border border-slate-600 bg-slate-950 px-2 py-2 font-mono text-xs text-white" />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">
                  Data final
                  <input aria-label="Data final da exportação" type="date" value={exportEndDate} min={exportStartDate} max={maximumDate} onChange={(event) => setExportEndDate(event.target.value)} className="border border-slate-600 bg-slate-950 px-2 py-2 font-mono text-xs text-white" />
                </label>
              </div>
              <div className={`mt-3 text-[11px] ${exportRangeError ? "text-rose-300" : "text-emerald-300"}`}>
                {exportRangeError || `${exportDayCount} dia(s), com uma aba por dia.`}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowExportDialog(false)} disabled={isExporting} className="border border-slate-600 px-3 py-1.5 text-xs font-bold hover:bg-slate-800 disabled:opacity-50">Cancelar</button>
                <button
                  type="button"
                  disabled={isExporting || Boolean(exportRangeError)}
                  onClick={() => {
                    setShowExportDialog(false);
                    onExport(exportStartDate, exportEndDate);
                  }}
                  className="flex items-center gap-1 border border-emerald-500 bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" /> {isExporting ? "Gerando…" : "Gerar Excel"}
                </button>
              </div>
            </div>
          </div>
        )}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center space-x-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded text-xs transition-colors border border-slate-600 font-medium"
          title="Recarregar Dados e Recalcular Jornadas"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-400" : "text-slate-300"}`} />
          <span>Atualizar</span>
        </button>
        </div>
      </div>
    </div>
  );
}
