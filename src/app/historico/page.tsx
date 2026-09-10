"use client";

import React from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { History, ShieldCheck, FileSpreadsheet } from "lucide-react";

export default function HistoricoPage() {
  const sampleAuditEvents = [
    {
      id: "log-1",
      timestamp: "2026-06-02 12:50:14",
      user: "Operador de Despacho",
      action: "REGISTRO DE SAÍDA",
      details: "Condutor: Marcelo Leandro | Saída: 12:50:00 | Jornada: 11h31min | Próx. Prev: 00:00:00",
    },
    {
      id: "log-2",
      timestamp: "2026-06-02 11:00:05",
      user: "Operador de Despacho",
      action: "REGISTRO DE SAÍDA",
      details: "Condutor: Rafael Lima Amorim | Saída: 11:00:00 | Jornada: 10h06min | Próx. Prev: 22:10:00",
    },
    {
      id: "log-3",
      timestamp: "2026-06-02 04:00:22",
      user: "Supervisor Roberto",
      action: "AUTORIZAÇÃO DE ABONO",
      details: "Condutor: Marcos Roberto de Oliveira | Motivo: ESTOURO DE JORNADA | Status: Aprovado",
    },
    {
      id: "log-4",
      timestamp: "2026-06-02 01:19:00",
      user: "Operador de Despacho",
      action: "REGISTRO DE ENTRADA",
      details: "Condutor: Marcelo Leandro | Entrada: 01:19:00 | Frota: PZB0F50 | Destino: LP",
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-950">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col p-3 overflow-hidden">
          <div className="bg-slate-900 border border-slate-800 rounded p-3 mb-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <History className="w-4 h-4 text-emerald-400" />
              <span>Trilha de Auditoria e Histórico de Despachos</span>
            </h2>
            <p className="text-xs text-slate-400">
              Registro cronológico inviolável de todas as ações operacionais
            </p>
          </div>

          <div className="border border-slate-800 rounded bg-slate-900 overflow-y-auto flex-1 shadow-md">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-800 text-slate-300 font-bold sticky top-0 border-b border-slate-700">
                <tr>
                  <th className="px-3 py-2">DATA / HORA</th>
                  <th className="px-3 py-2">USUÁRIO RESPONSÁVEL</th>
                  <th className="px-3 py-2">AÇÃO REALIZADA</th>
                  <th className="px-3 py-2">DETALHES DA OPERAÇÃO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                {sampleAuditEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/60 h-9">
                    <td className="px-3 py-2 text-slate-400 font-bold">{evt.timestamp}</td>
                    <td className="px-3 py-2 text-emerald-400 font-sans font-medium">{evt.user}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        {evt.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-300 font-sans">{evt.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
