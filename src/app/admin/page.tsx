"use client";

import React, { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Settings, Sliders, MapPin, Database, Loader2, ShieldAlert } from "lucide-react";
import { dispatchService } from "@/lib/services/dispatch-service";
import { Base, Location } from "@/types/database";
import { useAuth } from "@/lib/auth-context";
import { SupabaseUsage } from "@/components/layout/SupabaseUsage";

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [bases, setBases] = useState<Base[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const authorized = user?.role === "admin" || user?.role === "supervisor";

  useEffect(() => {
    if (authLoading || !authorized) {
      if (!authLoading) setLoading(false);
      return;
    }
    Promise.all([dispatchService.getBases(), dispatchService.getLocations()])
      .then(([nextBases, nextLocations]) => {
        setBases(nextBases);
        setLocations(nextLocations);
      })
      .finally(() => setLoading(false));
  }, [authLoading, authorized]);

  return (
    <div className="excel-shell flex-1 flex flex-col min-h-screen">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="excel-workspace flex-1 flex flex-col p-3 overflow-y-auto space-y-4">
          {!authLoading && !authorized ? (
            <div className="flex min-h-64 items-center justify-center border border-amber-400 bg-amber-50 p-8 text-center text-sm text-amber-950">
              <div>
                <ShieldAlert className="mx-auto mb-3 h-8 w-8" />
                <strong className="block">Acesso restrito</strong>
                <span>Somente supervisores e administradores podem abrir esta área.</span>
              </div>
            </div>
          ) : loading || authLoading ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-xs font-semibold text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-[#107c41]" /> Carregando dados reais…
            </div>
          ) : <>
          <div className="excel-toolbar border border-[#a6a6a6] bg-[#f3f3f3] rounded p-3 shadow-xs">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
              <Settings className="w-4 h-4 text-[#107c41]" />
              <span>Parâmetros Operacionais e Administração</span>
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Configurações de descanso regulamentar, bases operacionais e destinos cadastrados
            </p>
          </div>

          <SupabaseUsage />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Parâmetros de Interjornada */}
            <div className="bg-white border border-[#a6a6a6] rounded p-4 shadow-xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-[#107c41]" />
                <span>Parâmetros Globais de Cálculo</span>
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded border border-slate-300">
                  <div>
                    <div className="font-bold text-slate-900">Tempo de Interjornada Padrão</div>
                    <div className="text-[11px] text-slate-600">11 horas de descanso legal CLT + 10 min de tolerância</div>
                  </div>
                  <span className="font-mono font-bold text-[#107c41] text-sm">11h 10min (670 min)</span>
                </div>

                <div className="flex justify-between items-center p-2.5 bg-slate-50 rounded border border-slate-300">
                  <div>
                    <div className="font-bold text-slate-900">Virada de Meia-Noite</div>
                    <div className="text-[11px] text-slate-600">Compensação exata de 24h para jornadas noturnas</div>
                  </div>
                  <span className="font-mono font-bold text-[#107c41] text-sm">Ativo</span>
                </div>
              </div>
            </div>

            {/* Bases Operacionais */}
            <div className="bg-white border border-[#a6a6a6] rounded p-4 shadow-xs">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-[#107c41]" />
                <span>Bases de Lotação Cadastradas</span>
              </h3>
              <div className="space-y-2 text-xs">
                {bases.map((b) => (
                  <div key={b.id} className="flex justify-between items-center p-2 bg-slate-50 rounded border border-slate-300">
                    <span className="font-bold text-slate-900">{b.name}</span>
                    <span className="font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-300">
                      {b.code}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Destinos */}
          <div className="bg-white border border-[#a6a6a6] rounded p-4 shadow-xs">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center space-x-2">
              <Database className="w-4 h-4 text-[#107c41]" />
              <span>Locais e Destinos Operacionais ({locations.length})</span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {locations.map((loc) => (
                <span
                  key={loc.id}
                  className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded text-[11px] text-slate-800 font-mono font-bold"
                >
                  {loc.name}
                </span>
              ))}
            </div>
          </div>
          </>}
        </main>
      </div>
    </div>
  );
}
