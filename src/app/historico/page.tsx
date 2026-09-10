"use client";

import React, { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { createClient } from "@/lib/supabase/client";
import { History, ShieldCheck, Database, Loader2 } from "lucide-react";

interface AuditEvent {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  details: string;
}

const SAMPLE_AUDIT_EVENTS: AuditEvent[] = [
  {
    id: "log-1",
    timestamp: "2026-09-01 12:50:14",
    user: "Operador de Despacho",
    action: "REGISTRO DE SAÍDA",
    details: "Condutor: Marcelo Leandro | Saída: 12:50:00 | Jornada: 11h31min | Próx. Prev: 00:00:00",
  },
  {
    id: "log-2",
    timestamp: "2026-09-01 11:00:05",
    user: "Operador de Despacho",
    action: "REGISTRO DE SAÍDA",
    details: "Condutor: Rafael Lima Amorim | Saída: 11:00:00 | Jornada: 10h06min | Próx. Prev: 22:10:00",
  },
  {
    id: "log-3",
    timestamp: "2026-09-01 04:00:22",
    user: "Supervisor Roberto",
    action: "AUTORIZAÇÃO DE ABONO",
    details: "Condutor: Marcos Roberto de Oliveira | Motivo: ESTOURO DE JORNADA | Status: Aprovado",
  },
  {
    id: "log-4",
    timestamp: "2026-09-01 01:19:00",
    user: "Operador de Despacho",
    action: "REGISTRO DE ENTRADA",
    details: "Condutor: Marcelo Leandro | Entrada: 01:19:00 | Frota: PZB0F50 | Destino: LP",
  },
];

export default function HistoricoPage() {
  const [events, setEvents] = useState<AuditEvent[]>(SAMPLE_AUDIT_EVENTS);
  const [source, setSource] = useState<"supabase" | "demo">("demo");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLogs() {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && key && !url.includes("placeholder")) {
        try {
          const supabase = createClient();
          const { data, error } = await supabase
            .from("audit_logs")
            .select("*")
            .order("timestamp", { ascending: false })
            .limit(50);

          if (!error && data && data.length > 0) {
            const mapped = data.map((item) => ({
              id: item.id,
              timestamp: new Date(item.timestamp).toLocaleString("pt-BR"),
              user: item.user_id || "Operador",
              action: item.action,
              details: JSON.stringify(item.new_values || item.old_values || {}),
            }));
            setEvents(mapped);
            setSource("supabase");
            return;
          }
        } catch {
          // fallback para mock
        }
      }
      setEvents(SAMPLE_AUDIT_EVENTS);
      setSource("demo");
    }

    loadLogs().finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-950 text-slate-100">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col p-3 overflow-hidden gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded p-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <History className="w-4 h-4 text-emerald-400" />
                <span>Trilha de Auditoria e Histórico de Despachos</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Rastreabilidade de alterações cadastrais e operacionais em conformidade com as regras de negócio.
              </p>
            </div>
            <span className="flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-xs font-semibold text-emerald-400 border border-slate-700">
              <Database className="h-3 w-3" />
              {source === "supabase" ? "Supabase (Ao Vivo)" : "Demonstração Local"}
            </span>
          </div>

          <div className="flex-1 bg-slate-900 border border-slate-800 rounded overflow-hidden flex flex-col">
            <div className="bg-slate-850 p-2.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Registros Recentes de Atividade</span>
              <div className="flex items-center space-x-1 text-emerald-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Auditoria Ativa</span>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-3">
              {loading ? (
                <div className="flex h-full items-center justify-center gap-2 text-xs text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  Carregando trilha de auditoria...
                </div>
              ) : (
                <div className="space-y-2">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="bg-slate-950 border border-slate-800 rounded p-3 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2 hover:border-slate-700 transition"
                    >
                      <div className="flex items-start md:items-center space-x-3">
                        <div className="px-2 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-300 rounded text-[10px] font-mono font-semibold">
                          {event.action}
                        </div>
                        <div>
                          <div className="text-slate-200 font-medium">{event.details}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Realizado por: <span className="text-slate-400">{event.user}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono shrink-0">
                        {event.timestamp}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
