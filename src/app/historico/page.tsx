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

const FIELD_LABELS: Record<string, string> = {
  forecast_start_time: "Previsão",
  status: "Status",
  abono_reason: "Motivo do abono",
  authorized_by: "Autorizado por",
  location_id: "Local",
  entry_time: "Entrada",
  fleet: "Frota",
  cargo_status: "C/V",
  destination_name: "Destino",
  final_destination_name: "Destino final",
  exit_time: "Saída",
  observations: "Observação",
};

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "vazio";
  return String(value);
}

function describeChanges(oldValues: Record<string, unknown>, newValues: Record<string, unknown>) {
  return Object.entries(newValues)
    .map(([field, value]) => {
      const label = FIELD_LABELS[field] || field.replaceAll("_", " ");
      const before = displayValue(oldValues[field]);
      return `${label}: ${before} → ${displayValue(value)}`;
    })
    .join(" | ");
}

export default function HistoricoPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [source, setSource] = useState<"supabase" | "unavailable">("unavailable");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLogs() {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && key && !url.includes("placeholder")) {
        try {
          const supabase = createClient();
          const [{ data, error }, { data: profiles }] = await Promise.all([
            supabase.from("audit_logs").select("*").order("timestamp", { ascending: false }).limit(50),
            supabase.from("profiles").select("id, name"),
          ]);

          if (!error && data) {
            const profileNames = new Map((profiles || []).map((profile) => [profile.id, profile.name]));
            const mapped = data.map((item) => ({
              id: item.id,
              timestamp: new Date(item.timestamp).toLocaleString("pt-BR"),
              user: profileNames.get(item.user_id) || "Operador",
              action: item.action === "UPDATE" ? "ALTERAÇÃO" : item.action,
              details: describeChanges(item.old_values || {}, item.new_values || {}),
            }));
            setEvents(mapped);
            setSource("supabase");
            return;
          }
        } catch {
          // fallback para mock
        }
      }
      setEvents([]);
      setSource("unavailable");
    }

    loadLogs().finally(() => setLoading(false));
  }, []);

  return (
    <div className="excel-shell flex-1 flex flex-col min-h-screen">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="excel-workspace flex-1 flex flex-col overflow-hidden gap-3">
          <div className="excel-toolbar border border-[#a6a6a6] bg-[#f3f3f3] rounded p-3 flex items-center justify-between shadow-xs">
            <div>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                <History className="w-4 h-4 text-[#107c41]" />
                <span>Trilha de Auditoria e Histórico de Despachos</span>
              </h2>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Rastreabilidade de alterações cadastrais e operacionais em conformidade com as regras de negócio.
              </p>
            </div>
            <span className="flex items-center gap-1 rounded bg-[#e2f0d9] border border-[#a9c99b] text-[#174d2d] px-2.5 py-1 text-xs font-bold">
              <Database className="h-3.5 w-3.5" />
              {source === "supabase" ? "Supabase (Ao Vivo)" : "Auditoria indisponível"}
            </span>
          </div>

          <div className="flex-1 bg-white border border-[#a6a6a6] rounded overflow-hidden flex flex-col shadow-xs">
            <div className="bg-[#f3f3f3] p-2.5 border-b border-slate-300 flex items-center justify-between text-xs text-slate-700">
              <span className="font-bold text-slate-800">Registros Recentes de Atividade</span>
              <div className="flex items-center space-x-1 text-[#107c41] font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Auditoria Ativa</span>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-3">
              {loading ? (
                <div className="flex h-full items-center justify-center gap-2 text-xs text-slate-600 font-semibold">
                  <Loader2 className="h-4 w-4 animate-spin text-[#107c41]" />
                  Carregando trilha de auditoria...
                </div>
              ) : (
                <div className="space-y-2">
                  {events.length === 0 && (
                    <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-xs text-slate-600">
                      Nenhuma alteração registrada até o momento.
                    </div>
                  )}
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="bg-slate-50 border border-slate-300 rounded p-3 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2 hover:bg-slate-100 transition"
                    >
                      <div className="flex items-start md:items-center space-x-3">
                        <div className="px-2 py-0.5 bg-[#e2f0d9] border border-[#a9c99b] text-[#174d2d] rounded text-[10px] font-mono font-bold">
                          {event.action}
                        </div>
                        <div>
                          <div className="text-slate-900 font-semibold">{event.details}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 font-sans">
                            Realizado por: <span className="text-slate-700 font-medium">{event.user}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono shrink-0 font-medium">
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
