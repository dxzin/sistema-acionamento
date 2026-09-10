"use client";

import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { loadMonthlySchedule, saveMonthlySchedule, SCALE_CODES, ScheduleCatalog, ScheduleCellChange } from "@/lib/services/schedule-service";
import { Driver } from "@/types/database";
import { AlertCircle, CalendarDays, CheckCircle2, Database, Loader2, Save, Search, X } from "lucide-react";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const VALID_CODES = new Set<string>(SCALE_CODES);

function cellKey(driverId: string, day: number) { return `${driverId}:${day}`; }
function normalizeCode(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4); }
function codeClass(code: string) {
  if (code === "F" || code === "FE") return "is-rest";
  if (["AT", "AF", "DESL"].includes(code)) return "is-exception";
  if (/^[1-6]$/.test(code)) return "is-work";
  return code ? "is-invalid" : "";
}

export default function EscalaPage() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [region, setRegion] = useState("SP");
  const [search, setSearch] = useState("");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [source, setSource] = useState<ScheduleCatalog["source"]>("demo");
  const [changes, setChanges] = useState<Record<string, ScheduleCellChange>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, index) => index + 1), [daysInMonth]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setSuccess(null); setChanges({});
    loadMonthlySchedule(month, year, region)
      .then((catalog) => {
        if (cancelled) return;
        setDrivers(catalog.drivers); setSource(catalog.source);
        setValues(Object.fromEntries(catalog.entries.map((entry) => [cellKey(entry.driver_id, entry.day_of_month), entry.scale_code])));
      })
      .catch((reason: Error) => !cancelled && setError(`Não foi possível carregar a escala: ${reason.message}`))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [month, year, region]);

  const filteredDrivers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return drivers.filter((driver) => !query || driver.name.toLocaleLowerCase("pt-BR").includes(query) || driver.login_matricula.includes(query));
  }, [drivers, search]);

  function updateCell(driverId: string, day: number, rawValue: string) {
    const value = normalizeCode(rawValue);
    const key = cellKey(driverId, day);
    setValues((current) => ({ ...current, [key]: value }));
    setChanges((current) => ({ ...current, [key]: { driver_id: driverId, day_of_month: day, scale_code: value } }));
    setSuccess(null);
  }

  function focusCell(row: number, day: number) {
    const boundedRow = Math.max(0, Math.min(filteredDrivers.length - 1, row));
    const boundedDay = Math.max(1, Math.min(daysInMonth, day));
    inputRefs.current[cellKey(filteredDrivers[boundedRow]?.id || "", boundedDay)]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, row: number, day: number) {
    if (event.key === "ArrowRight") { event.preventDefault(); focusCell(row, day + 1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); focusCell(row, day - 1); }
    else if (event.key === "ArrowDown" || event.key === "Enter") { event.preventDefault(); focusCell(row + 1, day); }
    else if (event.key === "ArrowUp") { event.preventDefault(); focusCell(row - 1, day); }
  }

  async function handleSave() {
    const pending = Object.values(changes);
    const invalid = pending.find((change) => change.scale_code && !VALID_CODES.has(change.scale_code));
    if (invalid) { setError(`Código inválido: “${invalid.scale_code}”. Use 1–6, F, FE, AT, AF ou DESL.`); return; }
    if (!pending.length) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      await saveMonthlySchedule(month, year, region, pending, source);
      setChanges({}); setSuccess(`${pending.length} ${pending.length === 1 ? "célula salva" : "células salvas"}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a escala.");
    } finally { setSaving(false); }
  }

  function handleWorkspaceKeyDown(event: KeyboardEvent<HTMLElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void handleSave();
    }
  }

  const pendingCount = Object.keys(changes).length;

  return (
    <div className="excel-shell flex min-h-screen flex-1 flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="excel-workspace flex flex-1 flex-col overflow-hidden" onKeyDown={handleWorkspaceKeyDown}>
          <section className="excel-schedule-toolbar flex flex-wrap items-center gap-2 p-2">
            <div className="mr-auto flex min-w-52 items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              <div><h1 className="text-sm font-semibold">Escala mensal</h1><p className="text-[11px] text-neutral-600">Enter/setas navegam · Ctrl+S salva</p></div>
            </div>
            <select aria-label="Mês" value={month} onChange={(event: ChangeEvent<HTMLSelectElement>) => setMonth(Number(event.target.value))} className="h-8 px-2 text-xs">
              {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select>
            <select aria-label="Ano" value={year} onChange={(event) => setYear(Number(event.target.value))} className="h-8 px-2 text-xs">
              {Array.from({ length: 7 }, (_, index) => today.getFullYear() - 2 + index).map((value) => <option key={value}>{value}</option>)}
            </select>
            <select aria-label="Região" value={region} onChange={(event) => setRegion(event.target.value)} className="h-8 px-2 text-xs">
              <option value="SP">SP · LP / Castilho</option><option value="MG">MG · UB / LZ / JP</option><option value="MS">MS</option>
            </select>
            <div className="relative"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" /><input type="search" aria-label="Buscar condutor" placeholder="Condutor ou login" value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 w-44 pl-7 pr-2 text-xs" /></div>
            <button onClick={handleSave} disabled={!pendingCount || saving} className="flex h-8 min-w-28 items-center justify-center gap-1.5 px-3 text-xs font-semibold disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{pendingCount ? `Salvar (${pendingCount})` : "Salvo"}
            </button>
          </section>

          <section className="excel-schedule-legend flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-[10px]">
            <span className="excel-source flex items-center gap-1 px-2 py-0.5 font-semibold"><Database className="h-3 w-3" />{source === "supabase" ? "Supabase" : "Demonstração"}</span>
            <span><i className="is-work" />1–6 trabalho</span><span><i className="is-rest" />F / FE folga</span><span><i className="is-exception" />AT / AF / DESL ocorrência</span>
            <span className="ml-auto text-neutral-600">{filteredDrivers.length} condutores · {daysInMonth} dias</span>
          </section>

          {(error || success) && <div className={`excel-notice flex items-center gap-2 px-3 py-2 text-xs ${error ? "is-error" : "is-success"}`}>{error ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}<span>{error || success}</span><button className="ml-auto" onClick={() => { setError(null); setSuccess(null); }} aria-label="Fechar aviso"><X className="h-3.5 w-3.5" /></button></div>}

          <section className="excel-schedule-grid flex-1 overflow-auto">
            {loading ? <div className="flex h-full items-center justify-center gap-2 text-xs text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" />Carregando escala...</div> : (
              <table className="border-collapse text-[11px]">
                <thead className="sticky top-0 z-30"><tr>
                  <th className="sticky left-0 z-40 w-10 min-w-10 text-center">#</th><th className="sticky left-10 z-40 w-56 min-w-56">Condutor</th><th className="sticky left-66 z-40 w-16 min-w-16 text-center">Turno</th>
                  {days.map((day) => { const date = new Date(year, month - 1, day); const weekend = date.getDay() === 0 || date.getDay() === 6; return <th key={day} className={`w-10 min-w-10 text-center ${weekend ? "is-weekend" : ""}`}><strong>{day}</strong><small>{WEEKDAYS[date.getDay()]}</small></th>; })}
                </tr></thead>
                <tbody>{filteredDrivers.map((driver, row) => <tr key={driver.id}>
                  <td className="excel-row-number sticky left-0 z-20">{row + 1}</td><td className="excel-driver-cell sticky left-10 z-20" title={driver.name}><strong>{driver.name}</strong><small>{driver.login_matricula}</small></td><td className="excel-shift-cell sticky left-66 z-20">{driver.default_shift || "—"}</td>
                  {days.map((day) => { const key = cellKey(driver.id, day); const value = values[key] || ""; return <td key={day} className={`excel-scale-cell ${codeClass(value)} ${changes[key] ? "is-dirty" : ""}`}><input ref={(node) => { inputRefs.current[key] = node; }} aria-label={`${driver.name}, dia ${day}`} value={value} onChange={(event) => updateCell(driver.id, day, event.target.value)} onKeyDown={(event) => handleKeyDown(event, row, day)} onFocus={(event) => event.currentTarget.select()} /></td>; })}
                </tr>)}{!filteredDrivers.length && <tr><td colSpan={daysInMonth + 3} className="py-12 text-center text-neutral-500">Nenhum condutor ativo nesta região.</td></tr>}</tbody>
              </table>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
