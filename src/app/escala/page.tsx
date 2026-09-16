"use client";

import { ChangeEvent, ClipboardEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  exportScheduleToExcel,
  loadMonthlySchedule,
  normalizeScaleCode,
  parseScheduleFile,
  parseScheduleClipboard,
  saveMonthlySchedule,
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
type ScheduleSelection = {
  anchor: { row: number; day: number };
  focus: { row: number; day: number };
};

function cellKey(driverId: string, day: number) {
  return `${driverId}:${day}`;
}

function getShiftBadge(shift?: string | null) {
  const s = (shift || "").toUpperCase().trim();
  if (s === "A" || s.startsWith("04:")) {
    return "bg-[#FFF2CC] text-[#7F4B00] border border-[#FDE68A] font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs";
  }
  if (s === "B" || s.startsWith("12:")) {
    return "bg-[#DDEBF7] text-[#0369A1] border border-[#BAE6FD] font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs";
  }
  if (s === "C" || s.startsWith("20:")) {
    return "bg-[#EDE7F6] text-[#5B2C6F] border border-[#DDD6FE] font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs";
  }
  return "bg-slate-100 text-slate-700 border border-slate-300 font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap";
}

function getCodeCellClass(code: string, dirty: boolean) {
  if (code === "F") {
    return `excel-schedule-rest${dirty ? " ring-1 ring-amber-400" : ""}`;
  }
  if (code === "FE") {
    return `excel-schedule-vacation${dirty ? " ring-1 ring-amber-400" : ""}`;
  }
  if (dirty) return "bg-[#FFF8E1] text-[#B45309] font-bold ring-1 ring-amber-400";
  if (["AT", "AF", "SATD", "DESL"].includes(code)) return "bg-[#FFF2CC] text-[#9C5700] font-bold";
  if (/^[1-6]$/.test(code)) return "bg-[#E2F0D9] text-[#0B5A30] font-bold";
  if (code) return "bg-[#FFF2CC] text-[#9C5700] font-bold";
  return "bg-white text-slate-900";
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
  const [selection, setSelection] = useState<ScheduleSelection | null>(null);
  const selectionModeRef = useRef<"cells" | "rows" | "columns" | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, index) => index + 1), [daysInMonth]);

  useEffect(() => {
    const stopSelecting = () => {
      selectionModeRef.current = null;
    };
    window.addEventListener("mouseup", stopSelecting);
    return () => window.removeEventListener("mouseup", stopSelecting);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSuccess(null);
    setChanges({});
    setSelection(null);

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
        driver.login_matricula.toLowerCase().includes(query)
    );
  }, [drivers, search]);

  const selectionBounds = useMemo(() => {
    if (!selection) return null;
    return {
      startRow: Math.min(selection.anchor.row, selection.focus.row),
      endRow: Math.max(selection.anchor.row, selection.focus.row),
      startDay: Math.min(selection.anchor.day, selection.focus.day),
      endDay: Math.max(selection.anchor.day, selection.focus.day),
    };
  }, [selection]);

  function focusCellLater(row: number, day: number) {
    const driverId = filteredDrivers[row]?.id;
    if (!driverId) return;
    window.setTimeout(() => inputRefs.current[cellKey(driverId, day)]?.focus(), 0);
  }

  function selectCell(row: number, day: number, extend = false) {
    setSelection((current) => ({
      anchor: extend && current ? current.anchor : { row, day },
      focus: { row, day },
    }));
  }

  function selectRow(row: number, extend = false) {
    setSelection((current) => ({
      anchor: extend && current ? current.anchor : { row, day: 1 },
      focus: { row, day: daysInMonth },
    }));
    focusCellLater(row, 1);
  }

  function selectColumn(day: number, extend = false) {
    if (!filteredDrivers.length) return;
    setSelection((current) => ({
      anchor: extend && current ? current.anchor : { row: 0, day },
      focus: { row: filteredDrivers.length - 1, day },
    }));
    focusCellLater(0, day);
  }

  function selectAllCells() {
    if (!filteredDrivers.length) return;
    setSelection({
      anchor: { row: 0, day: 1 },
      focus: { row: filteredDrivers.length - 1, day: daysInMonth },
    });
    focusCellLater(0, 1);
  }

  function isCellSelected(row: number, day: number) {
    return Boolean(
      selectionBounds &&
        row >= selectionBounds.startRow &&
        row <= selectionBounds.endRow &&
        day >= selectionBounds.startDay &&
        day <= selectionBounds.endDay
    );
  }

  function updateCell(driverId: string, day: number, rawValue: string) {
    const value = normalizeScaleCode(rawValue);
    const key = cellKey(driverId, day);
    setValues((current) => ({ ...current, [key]: value }));
    setChanges((current) => ({
      ...current,
      [key]: { driver_id: driverId, day_of_month: day, scale_code: value },
    }));
    setSuccess(null);
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, row: number, day: number) {
    const text = event.clipboardData.getData("text/plain");
    event.preventDefault();

    const bounds = isCellSelected(row, day) && selectionBounds
      ? selectionBounds
      : { startRow: row, endRow: row, startDay: day, endDay: day };

    const pasted = parseScheduleClipboard(
      text,
      filteredDrivers.map((driver) => driver.id),
      bounds.startRow,
      bounds.startDay,
      daysInMonth,
      bounds.endRow,
      bounds.endDay
    );
    if (!pasted.length) return;

    setValues((current) => {
      const next = { ...current };
      pasted.forEach((change) => {
        next[cellKey(change.driver_id, change.day_of_month)] = change.scale_code;
      });
      return next;
    });
    setChanges((current) => {
      const next = { ...current };
      pasted.forEach((change) => {
        next[cellKey(change.driver_id, change.day_of_month)] = change;
      });
      return next;
    });
    setError(null);
    setSuccess(`${pasted.length} célula(s) colada(s). Clique em 'Salvar' para persistir.`);

    const first = pasted[0];
    const last = pasted[pasted.length - 1];
    const firstRow = filteredDrivers.findIndex((driver) => driver.id === first.driver_id);
    const lastRow = filteredDrivers.findIndex((driver) => driver.id === last.driver_id);
    setSelection({
      anchor: { row: firstRow, day: first.day_of_month },
      focus: { row: lastRow, day: last.day_of_month },
    });

    window.setTimeout(() => inputRefs.current[cellKey(last.driver_id, last.day_of_month)]?.focus(), 0);
  }

  function focusCell(row: number, day: number) {
    const boundedRow = Math.max(0, Math.min(filteredDrivers.length - 1, row));
    const boundedDay = Math.max(1, Math.min(daysInMonth, day));
    inputRefs.current[cellKey(filteredDrivers[boundedRow]?.id || "", boundedDay)]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, row: number, day: number) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAllCells();
    } else if (event.key === "Escape") {
      setSelection(null);
    } else if (event.key === "ArrowRight") {
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
    if (!pending.length) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveMonthlySchedule(month, year, region, pending, source);
      setChanges({});
      setSuccess(`${pending.length} ${pending.length === 1 ? "célula salva" : "células salvas"} com sucesso.`);
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
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        throw new Error("Use um arquivo .xlsx. Formatos .xls e .csv não são aceitos nesta versão segura.");
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("O arquivo excede o limite seguro de 5 MB.");
      }
      const buffer = await file.arrayBuffer();
      const result = await parseScheduleFile(buffer, drivers, daysInMonth);

      if (result.changes.length === 0) {
        setError("Nenhuma escala compatível foi encontrada na planilha importada.");
        return;
      }

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

  async function handleExport() {
    setError(null);
    try {
      await exportScheduleToExcel(month, year, region, filteredDrivers, values);
    } catch (reason) {
      setError(`Erro ao exportar arquivo: ${(reason as Error).message}`);
    }
  }

  const pendingCount = Object.keys(changes).length;

  return (
    <div className="excel-shell flex-1 flex flex-col min-h-screen">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="excel-workspace flex-1 flex flex-col overflow-hidden gap-2">
          {/* Barra de Ferramentas Estilo Excel */}
          <section className="excel-toolbar flex flex-wrap items-center justify-between gap-2 px-3 py-2 border border-[#a6a6a6] bg-[#f3f3f3] shadow-xs text-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2 mr-2">
                <div className="w-7 h-7 bg-[#107c41] text-white flex items-center justify-center rounded shadow-xs">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <h1 className="text-xs font-bold text-slate-900 leading-none">Escala Mensal</h1>
                  <p className="text-[10px] text-slate-600 mt-0.5">Planejamento e edição inline</p>
                </div>
              </div>

              {/* Mês */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold text-slate-700">Mês:</span>
                <select
                  aria-label="Mês"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="h-7 rounded border border-slate-400 bg-white px-2 text-xs font-medium text-slate-800 focus:border-[#107c41] focus:outline-none"
                >
                  {MONTHS.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ano */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold text-slate-700">Ano:</span>
                <select
                  aria-label="Ano"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="h-7 rounded border border-slate-400 bg-white px-2 text-xs font-medium text-slate-800 focus:border-[#107c41] focus:outline-none"
                >
                  {Array.from({ length: 7 }, (_, index) => today.getFullYear() - 2 + index).map(
                    (val) => (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Região */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold text-slate-700">Região:</span>
                <select
                  aria-label="Região"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="h-7 rounded border border-slate-400 bg-white px-2 text-xs font-bold text-slate-800 focus:border-[#107c41] focus:outline-none"
                >
                  <option value="SP">SP · LP / Castilho</option>
                  <option value="MG">MG · UB / LZ / JP</option>
                  <option value="MS">MS</option>
                </select>
              </div>

              {/* Busca de Condutor */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  aria-label="Buscar condutor"
                  placeholder="Buscar condutor ou login..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-7 w-48 rounded border border-slate-400 bg-white pl-8 pr-7 text-xs font-semibold text-slate-900 placeholder-slate-500 focus:border-[#107c41] focus:outline-none"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-800"
                    title="Limpar busca"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing || loading}
                className="flex h-7 items-center gap-1.5 rounded border border-slate-400 bg-white px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 transition-colors shadow-2xs"
                title="Importar planilha Excel .xlsx (máximo 5 MB)"
              >
                {importing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#107c41]" />
                ) : (
                  <Upload className="h-3.5 w-3.5 text-[#107c41]" />
                )}
                <span>Importar</span>
              </button>

              <button
                onClick={handleExport}
                disabled={loading || !filteredDrivers.length}
                className="flex h-7 items-center gap-1.5 rounded border border-slate-400 bg-white px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 transition-colors shadow-2xs"
                title="Exportar escala formatada para Excel"
              >
                <Download className="h-3.5 w-3.5 text-[#107c41]" />
                <span>Exportar (.xlsx)</span>
              </button>

              <button
                onClick={handleSave}
                disabled={saving || pendingCount === 0}
                className="flex h-7 items-center gap-1.5 rounded border border-[#0b5a30] bg-[#107c41] px-3 text-xs font-bold text-white hover:bg-[#0b5a30] disabled:opacity-50 transition-colors shadow-xs"
                title="Salvar alterações na escala"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span>Salvar {pendingCount > 0 ? `(${pendingCount})` : ""}</span>
              </button>

              <span
                className={`flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${
                  source === "supabase"
                    ? "border-[#a9c99b] bg-[#e2f0d9] text-[#174d2d]"
                    : "border-[#fde68a] bg-[#fff2cc] text-[#7f4b00]"
                }`}
              >
                <Database className="h-3 w-3" />
                {source === "supabase" ? "Supabase (Ao Vivo)" : "Modo Demonstração"}
              </span>
            </div>
          </section>

          {/* Avisos / Notificações */}
          {(error || success) && (
            <div
              className={`flex items-center justify-between gap-2 px-3 py-2 text-xs rounded border font-medium ${
                error
                  ? "border-[#e2aaa5] bg-[#fce8e6] text-[#8b1a1a]"
                  : "border-[#a9c99b] bg-[#e2f0d9] text-[#174d2d]"
              }`}
            >
              <div className="flex items-center gap-2">
                {error ? (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                )}
                <span>{error || success}</span>
              </div>
              <button
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                }}
                className="p-0.5 hover:opacity-75"
                aria-label="Fechar aviso"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Grade de Escala Estilo Excel */}
          <section className="excel-schedule-grid flex-1 overflow-hidden flex flex-col border border-[#a6a6a6] bg-white shadow-sm relative">
            {loading ? (
              <div className="flex h-full items-center justify-center gap-2 text-xs font-semibold text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-[#107c41]" />
                Carregando escala mensal...
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-175px)] relative select-none">
                <table className="border-collapse text-[11px] min-w-full font-sans table-fixed">
                  <colgroup>
                    <col style={{ width: "44px" }} />
                    <col style={{ width: "250px" }} />
                    <col style={{ width: "70px" }} />
                    <col style={{ width: "82px" }} />
                    {days.map((day) => (
                      <col key={day} style={{ width: "38px" }} />
                    ))}
                  </colgroup>

                  <thead className="sticky top-0 z-30">
                    <tr className="h-9">
                      <th
                        className={`excel-row-number sticky left-0 z-40 bg-[#107c41] text-white p-1 text-center font-bold text-xs border-r border-[#4e9d72] cursor-pointer ${
                          selectionBounds && selectionBounds.startRow === 0 && selectionBounds.endRow === filteredDrivers.length - 1 && selectionBounds.startDay === 1 && selectionBounds.endDay === daysInMonth
                            ? "excel-schedule-axis-selected"
                            : ""
                        }`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectAllCells();
                        }}
                        title="Selecionar toda a escala visível"
                      >
                        #
                      </th>
                      <th className="sticky left-[44px] z-40 bg-[#107c41] text-white px-2.5 py-1 text-left font-bold text-xs border-r border-[#4e9d72]">
                        <span className="tracking-wide">CONDUTOR</span>
                      </th>
                      <th className="sticky left-[294px] z-40 bg-[#107c41] text-white p-1 text-center font-bold text-xs border-r border-[#4e9d72]">
                        <span className="tracking-wide">TURNO</span>
                      </th>
                      <th className="sticky left-[364px] z-40 bg-[#107c41] text-white p-1 text-center font-bold text-xs border-r border-[#4e9d72] shadow-[2px_0_4px_-1px_rgba(0,0,0,0.15)]">
                        <span className="tracking-wide">HORÁRIO</span>
                      </th>
                      {days.map((day) => {
                        const date = new Date(year, month - 1, day);
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        return (
                          <th
                            key={day}
                            className={`p-1 text-center border-r border-[#4e9d72] cursor-pointer ${
                              isWeekend ? "bg-[#0b5a30] text-[#ffe082]" : "bg-[#107c41] text-white"
                            } ${selectionBounds && day >= selectionBounds.startDay && day <= selectionBounds.endDay && selectionBounds.startRow === 0 && selectionBounds.endRow === filteredDrivers.length - 1 ? "excel-schedule-axis-selected" : ""}`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selectionModeRef.current = "columns";
                              selectColumn(day, event.shiftKey);
                            }}
                            onMouseEnter={() => {
                              if (selectionModeRef.current !== "columns") return;
                              setSelection((current) => current ? {
                                ...current,
                                focus: { row: filteredDrivers.length - 1, day },
                              } : current);
                            }}
                            title={`Selecionar o dia ${day}`}
                          >
                            <div className="font-bold text-xs leading-tight">{day}</div>
                            <div className="text-[9px] uppercase font-mono opacity-85 leading-tight">
                              {WEEKDAYS[date.getDay()]}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#d9d9d9]">
                    {filteredDrivers.map((driver, row) => (
                      <tr key={driver.id} className="h-8 group hover:bg-[#e2f0d9]">
                        <td
                          className={`excel-row-number sticky left-0 z-20 bg-[#ededed] p-1 text-center text-slate-700 font-semibold border-r border-b border-slate-300 text-xs cursor-pointer ${
                            selectionBounds && row >= selectionBounds.startRow && row <= selectionBounds.endRow && selectionBounds.startDay === 1 && selectionBounds.endDay === daysInMonth
                              ? "excel-schedule-axis-selected"
                              : ""
                          }`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            selectionModeRef.current = "rows";
                            selectRow(row, event.shiftKey);
                          }}
                          onMouseEnter={() => {
                            if (selectionModeRef.current !== "rows") return;
                            setSelection((current) => current ? {
                              ...current,
                              focus: { row, day: daysInMonth },
                            } : current);
                          }}
                          title={`Selecionar a linha ${row + 1}`}
                        >
                          {row + 1}
                        </td>
                        <td
                          className="excel-driver-cell sticky left-[44px] z-20 bg-white group-hover:bg-[#e2f0d9] px-2.5 py-1 text-left border-r border-b border-slate-300 overflow-hidden"
                          title={driver.name}
                        >
                          <div className="excel-driver-name truncate leading-tight">
                            {driver.name}
                          </div>
                          <div className="excel-driver-login leading-tight">
                            {driver.login_matricula}
                          </div>
                        </td>
                        <td className="sticky left-[294px] z-20 bg-white group-hover:bg-[#e2f0d9] p-1 text-center border-r border-b border-slate-300">
                          <span className={getShiftBadge(driver.default_shift)}>
                            {driver.default_shift || "—"}
                          </span>
                        </td>
                        <td className="sticky left-[364px] z-20 bg-white group-hover:bg-[#e2f0d9] px-2 py-1 text-center border-r border-b border-slate-300 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)] font-mono font-bold text-slate-800">
                          {driver.default_start_time?.slice(0, 5) || "—"}
                        </td>
                        {days.map((day) => {
                          const key = cellKey(driver.id, day);
                          const value = values[key] || "";
                          const dirty = changes[key] !== undefined;

                          return (
                            <td
                              key={day}
                              className={`p-0 text-center border-r border-b border-slate-300 font-mono ${getCodeCellClass(
                                value,
                                dirty
                              )} ${isCellSelected(row, day) ? "excel-schedule-selected" : ""}`}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                selectCell(row, day, event.shiftKey);
                                selectionModeRef.current = "cells";
                                focusCellLater(row, day);
                              }}
                              onMouseEnter={() => {
                                if (selectionModeRef.current === "cells") selectCell(row, day, true);
                              }}
                              onMouseUp={() => {
                                selectionModeRef.current = null;
                              }}
                            >
                              <input
                                ref={(node) => {
                                  inputRefs.current[key] = node;
                                }}
                                aria-label={`${driver.name}, dia ${day}`}
                                value={value}
                                onChange={(e) => updateCell(driver.id, day, e.target.value)}
                                onPaste={(e) => handlePaste(e, row, day)}
                                onKeyDown={(e) => handleKeyDown(e, row, day)}
                                onFocus={(e) => e.currentTarget.select()}
                                className="h-7 w-full border-0 bg-transparent text-center font-bold uppercase text-xs focus:bg-white focus:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#107c41]"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {!filteredDrivers.length && (
                      <tr>
                        <td
                          colSpan={daysInMonth + 4}
                          className="py-12 text-center text-slate-600 font-medium bg-white"
                        >
                          Nenhum condutor encontrado com os filtros atuais nesta região.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
