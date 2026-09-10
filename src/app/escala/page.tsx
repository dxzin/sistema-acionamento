"use client";

import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  exportScheduleToExcel,
  loadMonthlySchedule,
  parseScheduleFile,
  saveMonthlySchedule,
  SCALE_CODES,
  ScheduleCatalog,
  ScheduleCellChange,
} from "@/lib/services/schedule-service";
import { Driver } from "@/types/database";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  Save,
  Search,
  Upload,
  X,
} from "lucide-react";

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const VALID_CODES = new Set<string>(SCALE_CODES);

function cellKey(driverId: string, day: number) {
  return `${driverId}:${day}`;
}

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

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
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, index) => index + 1), [daysInMonth]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSuccess(null);
    setChanges({});

    loadMonthlySchedule(month, year, region)
      .then((catalog) => {
        if (cancelled) return;
        setDrivers(catalog.drivers);
        setSource(catalog.source);
        setValues(
          Object.fromEntries(
            catalog.entries.map((entry) => [
              cellKey(entry.driver_id, entry.day_of_month),
              entry.scale_code,
            ])
          )
        );
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(`Não foi possível carregar a escala: ${reason.message}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month, year, region]);

  const filteredDrivers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return drivers.filter(
      (driver) =>
        !query ||
        driver.name.toLocaleLowerCase("pt-BR").includes(query) ||
        driver.login_matricula.includes(query)
    );
  }, [drivers, search]);

  function updateCell(driverId: string, day: number, rawValue: string) {
    const value = normalizeCode(rawValue);
    const key = cellKey(driverId, day);
    setValues((current) => ({ ...current, [key]: value }));
    setChanges((current) => ({
      ...current,
      [key]: { driver_id: driverId, day_of_month: day, scale_code: value },
    }));
    setSuccess(null);
  }

  function focusCell(row: number, day: number) {
    const boundedRow = Math.max(0, Math.min(filteredDrivers.length - 1, row));
    const boundedDay = Math.max(1, Math.min(daysInMonth, day));
    inputRefs.current[cellKey(filteredDrivers[boundedRow]?.id || "", boundedDay)]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, row: number, day: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusCell(row, day + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(row, day - 1);
    } else if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      focusCell(row + 1, day);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(row - 1, day);
    }
  }

  async function handleSave() {
    const pending = Object.values(changes);
    const invalid = pending.find(
      (change) => change.scale_code && !VALID_CODES.has(change.scale_code)
    );
    if (invalid) {
      setError(`Código inválido: “${invalid.scale_code}”. Use 1–6, F, FE, AT, AF ou DESL.`);
      return;
    }
    if (!pending.length) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveMonthlySchedule(month, year, region, pending, source);
      setChanges({});
      setSuccess(`${pending.length} ${pending.length === 1 ? "célula salva" : "células salvas"}.`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError(null);
    setSuccess(null);

    try {
      const buffer = await file.arrayBuffer();
      const result = parseScheduleFile(buffer, drivers, daysInMonth);

      if (result.changes.length === 0) {
        setError("Nenhuma escala compatível foi encontrada na planilha importada.");
        return;
      }

      // Aplica as alterações no estado local
      const newValues = { ...values };
      const newChanges = { ...changes };

      for (const item of result.changes) {
        const key = cellKey(item.driver_id, item.day_of_month);
        newValues[key] = item.scale_code;
        newChanges[key] = item;
      }

      setValues(newValues);
      setChanges(newChanges);
      setSuccess(
        `Importação concluída: ${result.totalEntries} códigos mapeados para ${result.matchedDriversCount} condutores. Clique em 'Salvar' para persistir.`
      );
    } catch (err) {
      setError(`Erro ao importar arquivo: ${(err as Error).message}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleExport() {
    exportScheduleToExcel(month, year, region, filteredDrivers, values);
  }

  const pendingCount = Object.keys(changes).length;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex flex-1 flex-col overflow-hidden p-3 gap-2">
          {/* Barra de Ferramentas */}
          <section className="excel-schedule-toolbar flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 mr-2">
              <CalendarDays className="h-4 w-4 text-emerald-400" />
              <div>
                <h1 className="text-xs font-semibold text-slate-100">Escala Mensal</h1>
                <p className="text-[10px] text-slate-400">Navegação por setas · Edição inline</p>
              </div>
            </div>

            <select
              aria-label="Mês"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="h-8 rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>

            <select
              aria-label="Ano"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-8 rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              {Array.from({ length: 7 }, (_, index) => today.getFullYear() - 2 + index).map(
                (val) => (
                  <option key={val} value={val}>
                    {val}
                  </option>
                )
              )}
            </select>

            <select
              aria-label="Região"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="h-8 rounded border border-slate-700 bg-slate-800 px-2 text-xs font-semibold text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="SP">SP · LP / Castilho</option>
              <option value="MG">MG · UB / LZ / JP</option>
              <option value="MS">MS</option>
            </select>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Buscar condutor"
                placeholder="Condutor ou login..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-44 rounded border border-slate-700 bg-slate-800 pl-8 pr-2 text-xs text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            {/* Input oculto para importação de arquivos */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing || loading}
              className="flex h-8 items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              title="Importar planilha Excel ou CSV"
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 text-emerald-400" />}
              Importar
            </button>

            <button
              onClick={handleExport}
              disabled={loading || !filteredDrivers.length}
              className="flex h-8 items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              title="Exportar escala atual para Excel"
            >
              <Download className="h-3.5 w-3.5 text-blue-400" />
              Exportar
            </button>

            <button
              onClick={handleSave}
              disabled={!pendingCount || saving}
              className="ml-auto flex h-8 min-w-28 items-center justify-center gap-1.5 rounded bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {pendingCount ? `Salvar (${pendingCount})` : "Salvo"}
            </button>
          </section>

          {/* Legenda e KPIs */}
          <section className="excel-schedule-legend flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-[11px] text-slate-300">
            <span className="excel-source flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 font-semibold text-emerald-400">
              <Database className="h-3 w-3" />
              {source === "supabase" ? "Supabase (Ao Vivo)" : "Demonstração Local"}
            </span>
            <span className="flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> 1–6 Trabalho
            </span>
            <span className="flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full bg-blue-500" /> F / FE Folga
            </span>
            <span className="flex items-center gap-1">
              <i className="inline-block h-2 w-2 rounded-full bg-amber-500" /> AT / AF / DESL Ocorrência
            </span>
            <span className="ml-auto text-slate-400 font-mono">
              {filteredDrivers.length} condutores · {daysInMonth} dias
            </span>
          </section>

          {/* Notificações */}
          {(error || success) && (
            <div
              className={`flex items-center gap-2 rounded px-3 py-2 text-xs ${
                error
                  ? "bg-rose-950/80 border border-rose-800 text-rose-200"
                  : "bg-emerald-950/80 border border-emerald-800 text-emerald-200"
              }`}
            >
              {error ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              <span>{error || success}</span>
              <button
                className="ml-auto hover:opacity-75"
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                }}
                aria-label="Fechar aviso"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Grade de Escala */}
          <section className="excel-schedule-grid flex-1 overflow-auto rounded border border-slate-800 bg-slate-900">
            {loading ? (
              <div className="flex h-full items-center justify-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                Carregando escala mensal...
              </div>
            ) : (
              <table className="border-collapse text-[11px] w-full font-mono">
                <thead className="sticky top-0 z-30 bg-slate-800 text-slate-300">
                  <tr>
                    <th className="sticky left-0 z-40 w-10 min-w-10 bg-slate-800 p-1 text-center border-b border-r border-slate-700">
                      #
                    </th>
                    <th className="sticky left-10 z-40 w-64 min-w-64 bg-slate-800 p-1 text-left border-b border-r border-slate-700">
                      Condutor
                    </th>
                    <th className="sticky left-74 z-40 w-16 min-w-16 bg-slate-800 p-1 text-center border-b border-r border-slate-700">
                      Turno
                    </th>
                    {days.map((day) => {
                      const date = new Date(year, month - 1, day);
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                      return (
                        <th
                          key={day}
                          className={`w-9 min-w-9 p-1 text-center border-b border-r border-slate-700 ${
                            isWeekend ? "bg-slate-700/60 text-amber-300" : ""
                          }`}
                        >
                          <div className="font-bold">{day}</div>
                          <div className="text-[9px] font-sans opacity-75">{WEEKDAYS[date.getDay()]}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredDrivers.map((driver, row) => (
                    <tr key={driver.id} className="hover:bg-slate-800/40">
                      <td className="sticky left-0 z-20 bg-slate-900 p-1 text-center text-slate-500 border-r border-slate-800 text-[10px]">
                        {row + 1}
                      </td>
                      <td
                        className="sticky left-10 z-20 bg-slate-900 px-2 py-1 text-left border-r border-slate-800 font-sans truncate max-w-[250px]"
                        title={driver.name}
                      >
                        <div className="font-semibold text-slate-200 truncate">{driver.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{driver.login_matricula}</div>
                      </td>
                      <td className="sticky left-74 z-20 bg-slate-900 p-1 text-center border-r border-slate-800 text-slate-400 font-bold">
                        {driver.default_shift || "—"}
                      </td>
                      {days.map((day) => {
                        const key = cellKey(driver.id, day);
                        const value = values[key] || "";
                        const dirty = changes[key] !== undefined;

                        return (
                          <td
                            key={day}
                            className={`p-0 text-center border-r border-slate-800 ${codeClass(value)} ${
                              dirty ? "bg-amber-950/40 font-bold" : ""
                            }`}
                          >
                            <input
                              ref={(node) => {
                                inputRefs.current[key] = node;
                              }}
                              aria-label={`${driver.name}, dia ${day}`}
                              value={value}
                              onChange={(e) => updateCell(driver.id, day, e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, row, day)}
                              onFocus={(e) => e.currentTarget.select()}
                              className="h-7 w-full bg-transparent text-center font-bold uppercase focus:bg-emerald-950 focus:text-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {!filteredDrivers.length && (
                    <tr>
                      <td colSpan={daysInMonth + 3} className="py-12 text-center text-slate-500 font-sans">
                        Nenhum condutor ativo nesta região.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
