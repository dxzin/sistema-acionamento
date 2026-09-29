"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DatabaseUsage, PerformanceUsage } from "@/lib/supabase/usage";

interface UsageData { database: DatabaseUsage; performance: PerformanceUsage; checkedAt: string; dashboardUrl: string }

let cachedUsage: UsageData | null = null;
let cachedUntil = 0;
let pendingUsage: Promise<UsageData> | null = null;

async function loadUsage() {
  if (cachedUsage && Date.now() < cachedUntil) return cachedUsage;
  if (pendingUsage) return pendingUsage;
  pendingUsage = fetch("/api/admin/supabase-usage")
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.erro || "Consumo indisponível.");
      cachedUsage = result as UsageData;
      cachedUntil = Date.now() + 5 * 60_000;
      return cachedUsage;
    })
    .finally(() => { pendingUsage = null; });
  return pendingUsage;
}

export function SupabaseUsage({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (document.visibilityState !== "visible") return;
      try {
        const result = await loadUsage();
        if (!cancelled) { setData(result); setError(""); }
      } catch (reason) {
        if (!cancelled) { setError((reason as Error).message); setData(null); }
      }
    }
    void load();
    const interval = setInterval(() => void load(), 15 * 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
  if (compact) {
    if (!data || data.database.level === "normal") return null;
    return <Link href="/admin" role="status" className="rounded bg-yellow-200 px-2 py-1 text-[10px] font-bold text-black">Supabase: banco em {data.database.percent.toFixed(1)}%</Link>;
  }
  const database = data?.database;
  return <section className="rounded border border-[#a6a6a6] bg-white p-4 text-xs shadow-xs">
    <h3 className="mb-2 font-bold text-slate-900">Consumo Supabase — Plano Free</h3>
    {error ? <p role="alert" className="text-red-700">{error}</p> : !database ? <p>Consultando consumo real…</p> : <>
      <div className="mb-2 flex justify-between gap-3 text-slate-900"><span>Banco de dados: {(database.usedBytes / 1024 / 1024).toFixed(1)} MB de 500 MB</span><strong>{database.percent.toFixed(1)}%</strong></div>
      <div role="progressbar" aria-label="Uso do banco Supabase" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, database.percent)} aria-valuetext={`${database.percent.toFixed(1)}% do limite`} className="h-3 overflow-hidden rounded bg-slate-200">
        <div style={{ width: `${Math.min(100, database.percent)}%` }} className={`h-full ${database.level === "normal" ? "bg-emerald-600" : database.level === "warning" ? "bg-yellow-500" : "bg-red-600"}`} />
      </div>
      <p role="status" className={`mt-2 ${database.level === "normal" ? "text-slate-600" : "font-bold text-red-700"}`}>
        {database.level === "normal" ? "Dentro do limite. Avisos em 80% e 90%." : database.level === "warning" ? "Atenção: banco acima de 80%. Planeje a mudança de plano." : database.level === "critical" ? "Banco acima de 90%. Considere mudar de plano antes de atingir o limite." : "Limite do banco atingido. Confira o Supabase para evitar bloqueio de gravações."}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="border border-slate-200 bg-slate-50 p-2"><span className="block text-[10px] text-slate-500">Consultas acumuladas</span><strong className="text-slate-900">{Math.round(data!.performance.totalQueries).toLocaleString("pt-BR")}</strong></div>
        <div className="border border-slate-200 bg-slate-50 p-2"><span className="block text-[10px] text-slate-500">Tempo médio</span><strong className="text-slate-900">{data!.performance.averageQueryMs.toFixed(2)} ms</strong></div>
        <div className="border border-slate-200 bg-slate-50 p-2"><span className="block text-[10px] text-slate-500">Conexões ativas</span><strong className="text-slate-900">{Math.round(data!.performance.activeConnections)}</strong></div>
        <div className="border border-slate-200 bg-slate-50 p-2"><span className="block text-[10px] text-slate-500">Acerto do cache</span><strong className="text-slate-900">{data!.performance.cacheHitPercent.toFixed(2)}%</strong></div>
      </div>
      <p className="mt-2 text-[11px] text-slate-600">Tamanho atual do banco, incluindo índices e bancos internos. As métricas de desempenho são acumuladas desde a última reinicialização do banco. Atualização a cada 15 minutos com a aba visível.</p>
      <p className="mt-1 text-[11px] text-slate-600">Tráfego, arquivos, autenticação e Realtime: consulte o consumo mensal no painel do Supabase.</p>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px]"><a href={data!.dashboardUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-700 underline">Abrir painel do Supabase</a><span className="text-slate-500">Última consulta: {new Date(data!.checkedAt).toLocaleString("pt-BR")}</span></div>
    </>}
  </section>;
}
