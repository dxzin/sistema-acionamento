"use client";

import { useEffect, useState } from "react";

type BridgeId = "empresa" | "notebook";
type BridgeStatus = {
  status: string;
  ultimo_sinal: string | null;
  ultimo_acesso_banco: string | null;
  query_enabled: boolean;
};

const labels: Record<string, string> = {
  online: "online", offline: "offline", sem_banco: "sem acesso ao banco",
  nao_configurada: "não configurada", indisponivel: "status indisponível",
};
const bridgeLabels: Record<BridgeId, string> = { empresa: "PC da empresa", notebook: "Notebook" };

export function SighraBridgeStatus({ canManage = false, compact = true }: { canManage?: boolean; compact?: boolean }) {
  const [status, setStatus] = useState("indisponivel");
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [activeBridge, setActiveBridge] = useState<BridgeId>("empresa");
  const [bridges, setBridges] = useState<Partial<Record<BridgeId, BridgeStatus>>>({});
  const [selectionEnabled, setSelectionEnabled] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  const update = async (signal?: AbortSignal) => {
    const response = await fetch("/api/integracoes/sighra", { cache: "no-store", signal });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (signal?.aborted) return;
    const selected = data.active_bridge === "notebook" ? "notebook" : "empresa";
    setActiveBridge(selected);
    setStatus(labels[data.status] ? data.status : "indisponivel");
    setLastSeen(data.ultimo_sinal ?? null);
    setBridges(data.bridges ?? {});
    setSelectionEnabled(data.selection_enabled === true);
  };

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try { await update(controller.signal); }
      catch { if (!controller.signal.aborted) setStatus("indisponivel"); }
    };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 30_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, []);

  async function selectBridge(nextBridge: BridgeId) {
    if (nextBridge === activeBridge || switching) return;
    setSwitching(true);
    setError("");
    try {
      const response = await fetch("/api/integracoes/sighra", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active_bridge: nextBridge }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "Não foi possível trocar a ponte.");
      setActiveBridge(nextBridge);
      const nextStatus = bridges[nextBridge];
      setStatus(nextStatus?.status ?? "indisponivel");
      setLastSeen(nextStatus?.ultimo_sinal ?? null);
      await update();
    } catch (reason) { setError((reason as Error).message); }
    finally { setSwitching(false); }
  }

  const title = error || (lastSeen
    ? `${bridgeLabels[activeBridge]} · último sinal: ${new Date(lastSeen).toLocaleString("pt-BR")}`
    : `${bridgeLabels[activeBridge]} · nenhum sinal recebido`);
  return <div className={compact
    ? "hidden lg:flex min-h-11 items-center gap-1.5 text-[10px] text-white"
    : "excel-toolbar flex min-h-11 flex-wrap items-center gap-2 border border-slate-300 p-3 text-sm"} title={title}>
    <div className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${status === "online" ? "bg-green-500" : "bg-amber-400"}`} />
      <span className="font-bold">{compact ? "SIGhRA:" : "Ponte SIGhRA ativa"}</span>
    </div>
    {canManage && selectionEnabled ? <select
        aria-label="Ponte SIGhRA ativa"
        value={activeBridge}
        disabled={switching}
        onChange={(event) => void selectBridge(event.target.value as BridgeId)}
        className={`${compact ? "min-h-8 text-[10px]" : "min-h-11 text-sm"} border border-white/30 bg-emerald-900 px-2 font-bold text-white outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60`}
      >
        <option value="empresa">PC da empresa — {labels[bridges.empresa?.status ?? "indisponivel"]}</option>
        <option value="notebook">Notebook — {labels[bridges.notebook?.status ?? "indisponivel"]}</option>
      </select> : <span>{bridgeLabels[activeBridge]}</span>}
    <span role={error ? "alert" : "status"} aria-live="polite" className={error
      ? compact ? "text-red-200" : "text-red-700"
      : compact ? "text-emerald-100" : status === "online" ? "text-emerald-700" : "text-amber-700"}>
        {switching ? "trocando…" : error ? error : labels[status]}
      </span>
    {!compact && <span className="w-full text-xs opacity-80">As duas pontes podem ficar ligadas; somente a selecionada recebe as consultas.</span>}
  </div>;
}
