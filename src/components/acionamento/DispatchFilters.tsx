"use client";

import React from "react";
import { DispatchFilterOptions } from "@/types/domain";
import { Calendar, LockKeyhole, LockOpen, RefreshCw, Search } from "lucide-react";
import { SheetStatus } from "@/types/database";
import { nextOperationalDate } from "@/lib/dates/operational-date";

interface DispatchFiltersProps {
  filters: DispatchFilterOptions;
  onFilterChange: (newFilters: Partial<DispatchFilterOptions>) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  sheetStatus: SheetStatus | null;
  onToggleSheetStatus: () => void;
  isChangingSheetStatus?: boolean;
}

export function DispatchFilters({
  filters,
  onFilterChange,
  onRefresh,
  isLoading = false,
  sheetStatus,
  onToggleSheetStatus,
  isChangingSheetStatus = false,
}: DispatchFiltersProps) {
  return (
    <div className="excel-toolbar p-2 flex flex-wrap items-center justify-between gap-2 text-xs">
      {/* Busca e Filtros Rápidos */}
      <div className="flex flex-wrap items-center gap-2.5 flex-1">
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

      {/* Botão de Atualização / Recálculo */}
      <div className="flex items-center space-x-2">
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
  );
}
