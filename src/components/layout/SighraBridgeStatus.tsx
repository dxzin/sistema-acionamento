"use client";

import { useEffect, useState } from "react";

const labels: Record<string, string> = {
  online: "Sighra: online", offline: "Sighra: ponte offline", sem_banco: "Sighra: sem acesso ao banco",
  nao_configurada: "Sighra: configurar ponte", indisponivel: "Sighra: status indisponível",
};

export function SighraBridgeStatus() {
  const [status, setStatus] = useState("indisponivel");
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const update = async () => {
      try {
        const response = await fetch("/api/integracoes/sighra", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) {
          setStatus(labels[data.status] ? data.status : "indisponivel");
          setLastSeen(data.ultimo_sinal ?? null);
        }
      } catch { if (!controller.signal.aborted) setStatus("indisponivel"); }
    };
    void update();
    const interval = setInterval(() => { void update(); }, 30_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, []);
  return <span className="hidden lg:flex items-center gap-1.5 text-[10px] text-white" role="status"
    title={lastSeen ? `Último sinal: ${new Date(lastSeen).toLocaleString("pt-BR")}` : "Nenhum sinal recebido"}>
    <span className={`h-2 w-2 rounded-full ${status === "online" ? "bg-green-300" : "bg-amber-300"}`} />
    {labels[status]}
  </span>;
}
