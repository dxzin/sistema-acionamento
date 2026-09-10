"use client";

import React from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { INITIAL_BASES, INITIAL_LOCATIONS } from "@/lib/mock-data";
import { Settings, Sliders, MapPin, Database } from "lucide-react";

export default function AdminPage() {
  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-950">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col p-3 overflow-y-auto space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded p-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <Settings className="w-4 h-4 text-emerald-400" />
              <span>Parâmetros Operacionais e Administração</span>
            </h2>
            <p className="text-xs text-slate-400">
              Configurações de descanso regulamentar, bases operacionais e destinos cadastrados
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Parâmetros de Interjornada */}
            <div className="bg-slate-900 border border-slate-800 rounded p-4">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <span>Parâmetros Globais de Cálculo</span>
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center p-2 bg-slate-800 rounded border border-slate-700">
                  <div>
                    <div className="font-semibold text-slate-200">Tempo de Interjornada Padrão</div>
                    <div className="text-[11px] text-slate-400">11 horas de descanso legal CLT + 10 min de tolerância</div>
                  </div>
                  <span className="font-mono font-bold text-emerald-400 text-sm">11h 10min (670 min)</span>
                </div>

                <div className="flex justify-between items-center p-2 bg-slate-800 rounded border border-slate-700">
                  <div>
                    <div className="font-semibold text-slate-200">Virada de Meia-Noite</div>
                    <div className="text-[11px] text-slate-400">Compensação exata de 24h para jornadas noturnas</div>
                  </div>
                  <span className="font-mono font-bold text-emerald-400 text-sm">Ativo</span>
                </div>
              </div>
            </div>

            {/* Bases Operacionais */}
            <div className="bg-slate-900 border border-slate-800 rounded p-4">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>Bases de Lotação Cadastradas</span>
              </h3>
              <div className="space-y-2 text-xs">
                {INITIAL_BASES.map((b) => (
                  <div key={b.id} className="flex justify-between items-center p-2 bg-slate-800 rounded border border-slate-700">
                    <span className="font-semibold text-slate-200">{b.name}</span>
                    <span className="font-mono font-bold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                      {b.code}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Destinos */}
          <div className="bg-slate-900 border border-slate-800 rounded p-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center space-x-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Locais e Destinos Operacionais ({INITIAL_LOCATIONS.length})</span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {INITIAL_LOCATIONS.map((loc) => (
                <span
                  key={loc.id}
                  className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-[11px] text-slate-200 font-mono"
                >
                  {loc.name}
                </span>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
