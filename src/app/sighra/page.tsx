"use client";
import { FormEvent, useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import type { SighraResult } from "@/lib/sighra/queries";
import { macroLocation, macroMapUrl } from "@/lib/sighra/queries";
import type { SighraMacro } from "@/lib/sighra/queries";

type Job = { id: string; login: string; status: string; created_at: string; since_date: string; result: SighraResult | null; error: string | null };
type Preview = { condutor: string; data: string; regiao: string; entrada: string | null; saida_atual: string | null; saida_sighra: string; updated_at: string };
const formatDate = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
const formatTimestamp = (value: string) => `${formatDate(value)} ${value.slice(11)}`;
function MacroPlace({ macro }: { macro: SighraMacro }) {
  const location = macroLocation(macro), map = macroMapUrl(macro);
  return <div className="space-y-1">
    <div>{location || "Local não cadastrado"}</div>
    {map && <a href={map} target="_blank" rel="noopener noreferrer" className="text-[#107c41] underline whitespace-nowrap">Ver no mapa</a>}
  </div>;
}

async function responseJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || "Não foi possível concluir a operação.");
  return data;
}

export default function SighraPage() {
  const [login, setLogin] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [region, setRegion] = useState("SP");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const waiting = job?.status === "queued" || job?.status === "running";
  const jobId = job?.id, jobStatus = job?.status, jobCreatedAt = job?.created_at;

  useEffect(() => {
    if (!jobId || !jobStatus || !["queued", "running"].includes(jobStatus)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (jobCreatedAt && Date.now() - Date.parse(jobCreatedAt) > 195_000) {
        setJob(current => current ? { ...current, status: "expired" } : current);
        setError("A ponte não respondeu a tempo. Confira a VPN e consulte novamente.");
        return;
      }
      try {
        const data: Job = await responseJson(await fetch(`/api/integracoes/sighra/consultas?id=${jobId}`, { cache: "no-store", signal: controller.signal }));
        if (controller.signal.aborted) return;
        setJob(data);
        if (data.status === "completed") { setDate(data.result?.last_end?.gps_at.slice(0, 10) ?? ""); setError(""); }
        if (data.status === "failed" || data.status === "expired") setError(data.error || "A consulta falhou.");
        if (["queued", "running"].includes(data.status)) timer = setTimeout(() => { void poll(); }, 2000);
      } catch (e) {
        if (!controller.signal.aborted) { setError((e as Error).message); timer = setTimeout(() => { void poll(); }, 5000); }
      }
    };
    timer = setTimeout(() => { void poll(); }, 1500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId, jobStatus, jobCreatedAt]);

  async function consult(event: FormEvent) {
    event.preventDefault();
    setRequesting(true); setError(""); setSuccess(""); setPreview(null); setJob(null); setDate("");
    try {
      const data = await responseJson(await fetch("/api/integracoes/sighra/consultas", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: login.trim() }),
      }));
      setJob(data);
    } catch (e) { setError((e as Error).message); }
    finally { setRequesting(false); }
  }
  async function checkSheet() {
    if (!job) return;
    setSaving(true); setError(""); setSuccess(""); setPreview(null);
    try {
      setPreview(await responseJson(await fetch(`/api/integracoes/sighra/preenchimento?${new URLSearchParams({ consulta: job.id, data: date, regiao: region })}`, { cache: "no-store" })));
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }
  async function applyExit() {
    if (!job || !preview) return;
    setSaving(true); setError("");
    try {
      await responseJson(await fetch("/api/integracoes/sighra/preenchimento", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consulta: job.id, data: preview.data, regiao: preview.regiao, updated_at: preview.updated_at }) }));
      setSuccess(`Saída ${preview.saida_sighra.slice(0, 5)} salva para ${preview.condutor} em ${formatDate(preview.data)} (${preview.regiao}).`);
      setPreview(null);
    } catch (e) { setError((e as Error).message); setPreview(null); }
    finally { setSaving(false); }
  }
  const end = job?.result?.last_end;
  return <div className="excel-shell flex-1 flex flex-col min-h-screen">
    <Header />
    <div className="flex flex-1 overflow-hidden">
      <Sidebar />
      <main className="excel-workspace flex-1 overflow-auto p-3 space-y-3">
        <section className="excel-toolbar border border-slate-300 p-3 text-sm">
          <h1 className="font-semibold text-lg">Consulta Sighra</h1>
          <p className="text-xs mt-1">Consulte as últimas 10 macros pelo login do condutor. A ponte e a VPN precisam estar conectadas.</p>
          <form onSubmit={consult} className="flex flex-wrap items-end gap-2 mt-3">
            <label className="text-xs">Login do condutor
              <input required inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20} value={login} onChange={e => setLogin(e.target.value)}
                className="block mt-1 border border-slate-400 bg-white text-slate-900 px-2 py-1.5 w-48" placeholder="Ex.: 30049" />
            </label>
            <button disabled={requesting || waiting} className="bg-[#107c41] text-white px-4 py-1.5 disabled:opacity-50">{requesting ? "Solicitando…" : "Consultar"}</button>
          </form>
        </section>
        {waiting && <p role="status" className="border border-amber-300 bg-amber-50 text-amber-900 p-3 text-sm">
          {job?.status === "running" ? "A ponte está consultando o Sighra…" : "Aguardando a ponte receber o pedido…"} A resposta aparecerá aqui automaticamente.
        </p>}
        {error && <p role="alert" className="border border-red-300 bg-red-50 text-red-900 p-3 text-sm">{error}</p>}
        {success && <p role="status" className="border border-green-300 bg-green-50 text-green-900 p-3 text-sm">{success}</p>}
        {job?.status === "completed" && <>
          <section className="border border-slate-300 bg-white text-slate-900 p-3 text-sm space-y-2">
            <h2 className="font-semibold">Último fim de jornada · login {job.login}</h2>
            {end ? <>
              <p className="text-lg font-semibold">{formatDate(end.gps_at)} às {end.gps_at.slice(11, 16)} <span className="text-xs font-normal">· {end.name}</span></p>
              <div className="text-xs space-y-1"><p>Placa: {end.plate || "Não informada"} · ID do veículo: {end.vehicle || "—"}</p><MacroPlace macro={end} /></div>
              <p className="text-xs">Horário do GPS, com segundos descartados para o preenchimento. Esse evento não confirma que a jornada atual já terminou.</p>
              <div className="flex flex-wrap items-end gap-2 pt-2">
                <label className="text-xs">Dia da folha<input type="date" value={date} onChange={e => { setDate(e.target.value); setPreview(null); setSuccess(""); }} className="block border border-slate-400 px-2 py-1 mt-1" /></label>
                <label className="text-xs">Região<select value={region} onChange={e => { setRegion(e.target.value); setPreview(null); setSuccess(""); }} className="block border border-slate-400 px-2 py-1 mt-1"><option>SP</option><option>UBJP</option><option>MS</option></select></label>
                <button disabled={saving || !date} onClick={() => { void checkSheet(); }} className="border border-[#107c41] text-[#107c41] px-3 py-1 disabled:opacity-50">Conferir preenchimento</button>
              </div>
              {preview && <div className="border border-slate-300 bg-slate-50 p-3 space-y-2">
                <p>{preview.condutor} · {formatDate(preview.data)} · {preview.regiao}</p>
                <p>Entrada: {preview.entrada?.slice(0, 5) || "Vazia"}. Saída atual: {preview.saida_atual?.slice(0, 5) || "Vazia"} → <strong>{preview.saida_sighra.slice(0, 5)}</strong>.</p>
                <p className="text-xs">Ao preencher, a jornada e a próxima previsão serão recalculadas e a alteração ficará no histórico.</p>
                <button disabled={saving} onClick={() => { void applyExit(); }} className="bg-[#107c41] text-white px-3 py-1 disabled:opacity-50">{saving ? "Salvando…" : "Preencher saída"}</button>
              </div>}
            </> : <p>Nenhum fim de jornada encontrado desde {formatDate(job.since_date)}. Isso não confirma que a jornada está aberta.</p>}
            <p className="text-xs text-slate-600">Busca separada das últimas 10 macros: FIM DE JORNADA e FIM DE JORNADA GA, nos últimos 30 dias.</p>
          </section>
          <section className="border border-slate-300 bg-white text-slate-900 overflow-auto">
            <h2 className="font-semibold text-sm p-3">Últimas 10 macros · login {job.login}</h2>
            <table className="w-full text-xs border-collapse">
              <thead className="bg-[#107c41] text-white"><tr>{["Macro", "Horário GPS", "Recebida no Sighra", "Placa", "Local da macro", "ID do veículo"].map(label => <th key={label} className="text-left border border-emerald-700 p-2">{label}</th>)}</tr></thead>
              <tbody>{job.result?.macros.map((row, i) => <tr key={i} className={i % 2 ? "bg-slate-50" : ""}>
                <td className="border border-slate-200 p-2">{row.name}</td><td className="border border-slate-200 p-2 font-mono whitespace-nowrap">{formatTimestamp(row.gps_at)}</td>
                <td className="border border-slate-200 p-2 font-mono whitespace-nowrap">{row.inserted_at ? formatTimestamp(row.inserted_at) : "—"}</td>
                <td className="border border-slate-200 p-2 whitespace-nowrap">{row.plate || "—"}</td>
                <td className="border border-slate-200 p-2 min-w-48"><MacroPlace macro={row} /></td>
                <td className="border border-slate-200 p-2">{row.vehicle || "—"}</td>
              </tr>)}</tbody>
            </table>
            {!job.result?.macros.length && <p className="p-3 text-sm">Nenhuma macro encontrada para esse login.</p>}
          </section>
        </>}
      </main>
    </div>
  </div>;
}
