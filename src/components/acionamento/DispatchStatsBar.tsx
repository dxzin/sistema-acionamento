"use client";

import React from "react";
import { DispatchSummaryKPIs } from "@/types/domain";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Truck,
  Users,
  XCircle,
} from "lucide-react";

interface DispatchStatsBarProps {
  summary: DispatchSummaryKPIs;
}

export function DispatchStatsBar({ summary }: DispatchStatsBarProps) {
  return (
    <div className="excel-kpis grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px mb-2">
      {/* Total Condutores */}
      <div className="bg-slate-800 border border-slate-700 rounded p-2 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase font-bold text-slate-400">Total Escala</div>
          <div className="text-base font-bold text-white font-mono">{summary.total}</div>
        </div>
        <Users className="w-5 h-5 text-slate-400 opacity-60" />
      </div>

      {/* Acionados */}
      <div className="bg-slate-800 border border-emerald-800/60 rounded p-2 flex items-center justify-between bg-emerald-950/20">
        <div>
          <div className="text-[10px] uppercase font-bold text-emerald-400">Acionados</div>
          <div className="text-base font-bold text-emerald-300 font-mono">{summary.acionados}</div>
        </div>
        <CheckCircle2 className="w-5 h-5 text-emerald-500 opacity-80" />
      </div>

      {/* Em Trânsito / Andamento */}
      <div className="bg-slate-800 border border-cyan-800/60 rounded p-2 flex items-center justify-between bg-cyan-950/20">
        <div>
          <div className="text-[10px] uppercase font-bold text-cyan-400">Em Trânsito</div>
          <div className="text-base font-bold text-cyan-300 font-mono">{summary.emAndamento}</div>
        </div>
        <Clock className="w-5 h-5 text-cyan-400 animate-pulse opacity-80" />
      </div>

      {/* Abonados */}
      <div className="bg-slate-800 border border-rose-800/60 rounded p-2 flex items-center justify-between bg-rose-950/20">
        <div>
          <div className="text-[10px] uppercase font-bold text-rose-400">Abonados</div>
          <div className="text-base font-bold text-rose-300 font-mono">{summary.abonados}</div>
        </div>
        <XCircle className="w-5 h-5 text-rose-400 opacity-80" />
      </div>

      {/* Apoio */}
      <div className="bg-slate-800 border border-amber-800/60 rounded p-2 flex items-center justify-between bg-amber-950/20">
        <div>
          <div className="text-[10px] uppercase font-bold text-amber-400">Apoio / PA</div>
          <div className="text-base font-bold text-amber-300 font-mono">{summary.apoios}</div>
        </div>
        <HelpCircle className="w-5 h-5 text-amber-400 opacity-80" />
      </div>

      {/* Trocas */}
      <div className="bg-slate-800 border border-yellow-800/60 rounded p-2 flex items-center justify-between bg-yellow-950/20">
        <div>
          <div className="text-[10px] uppercase font-bold text-yellow-400">Trocas / Pts</div>
          <div className="text-base font-bold text-yellow-300 font-mono">{summary.trocas}</div>
        </div>
        <Truck className="w-5 h-5 text-yellow-400 opacity-80" />
      </div>

      {/* Faltas */}
      <div className="bg-slate-800 border border-red-900 rounded p-2 flex items-center justify-between bg-red-950/30">
        <div>
          <div className="text-[10px] uppercase font-bold text-red-400">Faltas</div>
          <div className="text-base font-bold text-red-300 font-mono">{summary.faltas}</div>
        </div>
        <XCircle className="w-5 h-5 text-red-500 opacity-80" />
      </div>

      {/* Pendências de Abono */}
      <div className={`rounded p-2 flex items-center justify-between border ${
        summary.pendentesAbono > 0
          ? "bg-amber-500/20 border-amber-500 text-amber-300 animate-pulse"
          : "bg-slate-800 border-slate-700 text-slate-400"
      }`}>
        <div>
          <div className="text-[10px] uppercase font-bold">Pendências</div>
          <div className="text-base font-bold font-mono">{summary.pendentesAbono}</div>
        </div>
        <AlertTriangle className={`w-5 h-5 ${summary.pendentesAbono > 0 ? "text-amber-400" : "text-slate-500"}`} />
      </div>
    </div>
  );
}
