"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { createClient } from "@/lib/supabase/client";
import { escapeCsvCell } from "@/lib/exports/csv";
import { Database, Download, History, Loader2, Search, ShieldCheck } from "lucide-react";

const PAGE_SIZE = 50;
interface AuditEvent { id: string; timestamp: string; user: string; action: string; driver: string; details: string }
const FIELD_LABELS: Record<string, string> = {
  forecast_start_time: "Previsão", dispatch_status: "Status", abono_reason: "Motivo do abono",
  abono_authorized_by: "Autorizado por", origin_location_id: "Local", origin_source: "Origem do local",
  forecast_source: "Origem da previsão", entry_time: "Entrada", vehicle_id: "Frota", cargo_status: "C/V",
  destination_location_id: "Destino", final_destination_location_id: "Destino final", exit_time: "Saída",
  observations: "Observação", next_day_forecast_time: "Previsão do próximo dia",
  total_worked_minutes: "Tempo de jornada (min)", status: "Estado da folha",
};

export default function HistoricoPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string }>>([]);
  const [source, setSource] = useState<"supabase" | "unavailable">("unavailable");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [operator, setOperator] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadLogs = useCallback(async (nextPage = 0, append = false) => {
    setLoading(true);
    try {
      const supabase = createClient();
      let query = supabase.from("audit_logs").select("*").order("timestamp", { ascending: false });
      if (operator) query = query.eq("user_id", operator);
      if (startDate) query = query.gte("timestamp", `${startDate}T00:00:00-03:00`);
      if (endDate) query = query.lte("timestamp", `${endDate}T23:59:59.999-03:00`);
      const [{ data, error }, { data: profileRows }, { data: locationRows }, { data: vehicleRows }] = await Promise.all([
        query.range(nextPage * PAGE_SIZE, nextPage * PAGE_SIZE + PAGE_SIZE),
        supabase.from("profiles").select("id,name").order("name"),
        supabase.from("locations").select("id,name"),
        supabase.from("vehicles").select("id,plate_code"),
      ]);
      if (error) throw error;
      const fetchedRows = data || [];
      const rows = fetchedRows.slice(0, PAGE_SIZE);
      const dispatchIds = rows.filter((row) => row.entity_name === "dispatches").map((row) => row.entity_id);
      const { data: dispatchRows } = dispatchIds.length
        ? await supabase.from("dispatches").select("id,driver_id").in("id", dispatchIds)
        : { data: [] as Array<{ id: string; driver_id: string }> };
      const driverIds = (dispatchRows || []).map((row) => row.driver_id);
      const { data: driverRows } = driverIds.length
        ? await supabase.from("drivers").select("id,name").in("id", driverIds)
        : { data: [] as Array<{ id: string; name: string }> };
      const profileNames = new Map((profileRows || []).map((row) => [row.id, row.name]));
      const friendlyIds = new Map<string, string>([
        ...(locationRows || []).map((row) => [row.id, row.name] as [string, string]),
        ...(vehicleRows || []).map((row) => [row.id, row.plate_code] as [string, string]),
      ]);
      const dispatchDrivers = new Map((dispatchRows || []).map((row) => [row.id, row.driver_id]));
      const driverNames = new Map((driverRows || []).map((row) => [row.id, row.name]));
      const displayValue = (value: unknown) => value === null || value === undefined || value === "" ? "vazio" : friendlyIds.get(String(value)) || String(value);
      const mapped = rows.map((item) => {
        const oldValues = (item.old_values || {}) as Record<string, unknown>;
        const newValues = (item.new_values || {}) as Record<string, unknown>;
        const details = Object.entries(newValues).filter(([field, value]) => {
          const before = oldValues[field] === "" || oldValues[field] == null ? null : oldValues[field];
          const after = value === "" || value == null ? null : value;
          return JSON.stringify(before) !== JSON.stringify(after);
        }
        ).map(([field, value]) =>
          `${FIELD_LABELS[field] || field.replaceAll("_", " ")}: ${displayValue(oldValues[field])} → ${displayValue(value)}`
        ).join(" | ");
        const driverId = dispatchDrivers.get(item.entity_id);
        return { id: item.id, timestamp: new Date(item.timestamp).toLocaleString("pt-BR"), user: profileNames.get(item.user_id) || "Sistema", action: item.action === "UPDATE" ? "ALTERAÇÃO" : item.action, driver: driverId ? driverNames.get(driverId) || "Condutor não identificado" : "—", details: details || `${item.entity_name}: ${item.action}` };
      });
      setProfiles(profileRows || []);
      setEvents((current) => append ? [...current, ...mapped] : mapped);
      setHasMore(fetchedRows.length > PAGE_SIZE);
      setPage(nextPage);
      setSource("supabase");
    } catch (error) {
      console.error("Falha ao carregar auditoria:", error);
      if (!append) setEvents([]);
      setSource("unavailable");
    } finally { setLoading(false); }
  }, [endDate, operator, startDate]);

  useEffect(() => { void loadLogs(0); }, [loadLogs]);
  const visibleEvents = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return term ? events.filter((event) => `${event.user} ${event.driver} ${event.details}`.toLocaleLowerCase("pt-BR").includes(term)) : events;
  }, [events, search]);
  const exportCsv = () => {
    const rows = ["Data;Operador;Condutor;Ação;Detalhes", ...visibleEvents.map((event) => [event.timestamp, event.user, event.driver, event.action, event.details].map(escapeCsvCell).join(";"))];
    const blob = new Blob(["\uFEFF" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `historico-acionamento-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };

  return <div className="excel-shell flex min-h-screen flex-1 flex-col"><Header /><div className="flex flex-1 overflow-hidden"><Sidebar />
    <main className="excel-workspace flex flex-1 flex-col gap-3 overflow-hidden">
      <div className="excel-toolbar flex flex-wrap items-center justify-between gap-2 p-3"><div><h2 className="flex items-center gap-2 text-xs font-bold text-slate-900"><History className="h-4 w-4 text-[#107c41]" />Trilha de auditoria</h2><p className="mt-0.5 text-[11px] text-slate-600">Alterações operacionais com operador, condutor e valores legíveis.</p></div><span className="flex items-center gap-1 border border-[#a9c99b] bg-[#e2f0d9] px-2.5 py-1 text-xs font-bold text-[#174d2d]"><Database className="h-3.5 w-3.5" />{source === "supabase" ? "Supabase (Ao vivo)" : "Auditoria indisponível"}</span></div>
      <div className="excel-toolbar flex flex-wrap items-center gap-2 p-2"><label className="relative min-w-64 flex-1"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" /><input className="w-full py-1.5 pl-7 pr-2 text-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar condutor, operador ou alteração" /></label><input aria-label="Data inicial" title="Data inicial" type="date" className="px-2 py-1.5 text-xs" value={startDate} onChange={(event) => setStartDate(event.target.value)} /><input aria-label="Data final" title="Data final" type="date" className="px-2 py-1.5 text-xs" value={endDate} onChange={(event) => setEndDate(event.target.value)} /><select aria-label="Filtrar operador" className="px-2 py-1.5 text-xs" value={operator} onChange={(event) => setOperator(event.target.value)}><option value="">Todos os operadores</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select><button type="button" onClick={exportCsv} disabled={!visibleEvents.length} className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold"><Download className="h-3.5 w-3.5" />Exportar CSV</button></div>
      <div className="flex flex-1 flex-col overflow-hidden border border-[#a6a6a6] bg-white"><div className="flex items-center justify-between border-b border-slate-300 bg-[#f3f3f3] p-2.5 text-xs text-slate-700"><strong>Registros ({visibleEvents.length})</strong><span className="flex items-center gap-1 font-bold text-[#107c41]"><ShieldCheck className="h-3.5 w-3.5" />Auditoria protegida</span></div><div className="flex-1 overflow-auto"><table className="excel-catalog-grid excel-audit-grid w-full border-collapse text-xs"><colgroup><col style={{ width: 155 }} /><col style={{ width: 150 }} /><col style={{ width: 260 }} /><col style={{ width: 105 }} /><col /></colgroup><thead><tr><th>Data e hora</th><th>Operador</th><th>Condutor</th><th>Ação</th><th>Alterações</th></tr></thead><tbody>{visibleEvents.map((event) => <tr key={event.id}><td className="whitespace-nowrap font-mono">{event.timestamp}</td><td>{event.user}</td><td className="font-semibold">{event.driver}</td><td>{event.action}</td><td>{event.details}</td></tr>)}</tbody></table>{!loading && !visibleEvents.length && <div className="p-8 text-center text-xs text-slate-600">Nenhum registro encontrado com os filtros atuais.</div>}{loading && <div className="flex items-center justify-center gap-2 p-6 text-xs font-semibold text-slate-600"><Loader2 className="h-4 w-4 animate-spin text-[#107c41]" />Carregando histórico…</div>}</div>{hasMore && <button type="button" disabled={loading} onClick={() => void loadLogs(page + 1, true)} className="border-t border-slate-300 bg-[#f3f3f3] p-2 text-xs font-bold text-[#107c41]">Carregar mais 50 registros</button>}</div>
    </main></div></div>;
}
