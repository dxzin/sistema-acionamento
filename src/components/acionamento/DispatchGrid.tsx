"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { DispatchRowModel } from "@/types/domain";
import { DispatchStatus, CargoStatus } from "@/types/database";
import { normalizeClockTime } from "@/lib/calculations/jornada";
import { ArrowUpDown, Bell, BellRing, Check, ChevronDown, Columns3, Copy, Clock, Eye, EyeOff, Maximize2, Minimize2, Minus, Plus, Search, Trash2, Volume2, VolumeX, X } from "lucide-react";

interface DispatchGridProps {
  dispatches: DispatchRowModel[];
  onDraftRow?: (id: string, updates: Partial<DispatchRowModel>) => void;
  onUpdateRow: (id: string, updates: Partial<DispatchRowModel>) => Promise<void>;
  onUpdateBatch: (updates: Map<string, Partial<DispatchRowModel>>) => Promise<void>;
  locations: { id: string; name: string }[];
  saveState: { status: "idle" | "saving" | "saved" | "error"; message?: string };
  cellSaveStates?: Record<string, { status: "pending" | "saving" | "saved" | "error"; message?: string }>;
  readOnly?: boolean;
  activeEditors?: Record<string, string[]>;
  onActiveRowChange?: (rowId: string | null) => void;
  reminderTimes?: Record<string, string>;
  onSetReminder?: (dispatchId: string, driverName: string, time: string) => string | null;
  onRemoveReminder?: (dispatchId: string) => void;
  reminderVolume?: number;
  onReminderVolumeChange?: (volume: number) => void;
  onPreviewReminderSound?: () => void;
}

interface GridHistoryChange {
  id: string;
  before: Partial<DispatchRowModel>;
  after: Partial<DispatchRowModel>;
}

interface GridHistoryAction {
  changes: GridHistoryChange[];
}

type SortField = keyof DispatchRowModel | "driver_name" | "login" | "schedule_time";
type ColumnFilterKey =
  | "driver" | "login" | "schedule" | "forecast" | "status" | "reason"
  | "origin" | "entry" | "fleet" | "cargo" | "destination" | "finalDestination"
  | "exit" | "observations" | "scale" | "nextForecast" | "workedTime";

const FILTER_COLUMNS: ColumnFilterKey[] = [
  "driver", "login", "schedule", "forecast", "status", "reason", "origin", "entry",
  "fleet", "cargo", "destination", "finalDestination", "exit", "observations", "scale",
  "nextForecast", "workedTime",
];

const COLUMN_LABELS = [
  "Condutor", "Login", "Horário", "Previsão", "Status", "Motivo do abono", "Local",
  "Entrada", "Frota", "C/V", "Destino", "Destino final", "Saída", "Observação",
  "Dia de escala", "Prev. próximo dia", "Tempo de jornada",
];
const ROW_NUMBER_WIDTH = 44;
const COLUMN_WIDTHS = [230, 86, 92, 90, 135, 230, 100, 90, 100, 55, 120, 120, 90, 180, 80, 95, 110];

function getColumnValue(row: DispatchRowModel, key: ColumnFilterKey): string {
  const values: Record<ColumnFilterKey, string | null | undefined> = {
    driver: row.driver.name,
    login: row.driver.login_matricula,
    schedule: row.driver.default_start_time?.slice(0, 5),
    forecast: row.forecast_start_time,
    status: row.dispatch_status,
    reason: row.abono_reason,
    origin: row.origin_location?.name,
    entry: row.entry_time,
    fleet: row.fleet_code || row.vehicle?.plate_code,
    cargo: row.cargo_status,
    destination: row.destination_name || row.destination_location?.name,
    finalDestination: row.final_destination_name || row.final_destination_location?.name,
    exit: row.exit_time,
    observations: row.observations,
    scale: row.scale_day_status,
    nextForecast: row.next_day_forecast_time,
    workedTime: row.formatted_worked_time,
  };
  return String(values[key] || "").trim();
}

interface EditableLocationCellProps {
  value: string;
  options: string[];
  label: string;
  onCommit: (value: string) => void;
  onDraftChange: (value: string) => void;
}

function EditableLocationCell({ value, options, label, onCommit, onDraftChange }: EditableLocationCellProps) {
  const [draft, setDraft] = useState(value);
  const [showOptions, setShowOptions] = useState(false);
  const editedRef = useRef(false);
  const committedValueRef = useRef(value);

  useEffect(() => {
    if (editedRef.current) return;
    committedValueRef.current = value;
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (!editedRef.current) return;
    const normalized = draft.trim().replace(/\s+/g, " ").toUpperCase();
    editedRef.current = false;
    committedValueRef.current = normalized;
    setDraft(normalized);
    onCommit(normalized);
  };

  return (
    <div className="excel-combobox-cell">
      <input
        type="text"
        value={draft}
        aria-label={label}
        autoComplete="off"
        placeholder="Digite ou escolha"
        onChange={(event) => {
          const next = event.target.value.toUpperCase();
          editedRef.current = true;
          setDraft(next);
          onDraftChange(next);
        }}
        onBlur={() => {
          commit();
          setTimeout(() => setShowOptions(false), 120);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            const committed = committedValueRef.current;
            editedRef.current = false;
            setDraft(committed);
            onDraftChange(committed);
            onCommit(committed);
            event.currentTarget.blur();
          }
        }}
        className="excel-combobox-input"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Mostrar opções de ${label}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          setShowOptions((open) => !open);
        }}
        className="absolute right-0 top-0 z-10 flex h-full w-[18px] items-center justify-center border-l border-slate-300 bg-slate-50 text-slate-600 hover:bg-[#e2f0d9]"
      >
        <ChevronDown className="h-3 w-3" />
      </button>
      {showOptions && (
        <div className="excel-dark-popup absolute left-0 top-full z-[70] max-h-48 min-w-full overflow-y-auto border border-[#7f7f7f] bg-white shadow-xl">
          {options
            .filter((option) => !draft || option.toUpperCase().includes(draft.toUpperCase()))
            .map((option) => (
              <button
                type="button"
                key={option}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setDraft(option);
                  setShowOptions(false);
                  editedRef.current = false;
                  committedValueRef.current = option;
                  onDraftChange(option);
                  onCommit(option);
                }}
                className="block w-full whitespace-nowrap px-2 py-1 text-left text-[11px] font-semibold text-slate-800 hover:bg-[#e2f0d9]"
              >
                {option}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

interface EditableTextCellProps {
  value: string;
  placeholder: string;
  className: string;
  onCommit: (value: string) => void;
  onDraftChange: (value: string) => void;
}

function EditableTextCell({ value, placeholder, className, onCommit, onDraftChange }: EditableTextCellProps) {
  const [draft, setDraft] = useState(value);
  const editedRef = useRef(false);
  const committedValueRef = useRef(value);

  useEffect(() => {
    if (editedRef.current) return;
    committedValueRef.current = value;
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (!editedRef.current) return;
    const normalized = draft.trim();
    editedRef.current = false;
    committedValueRef.current = normalized;
    setDraft(normalized);
    onCommit(normalized);
  };

  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(event) => {
        editedRef.current = true;
        setDraft(event.target.value);
        onDraftChange(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          const committed = committedValueRef.current;
          editedRef.current = false;
          setDraft(committed);
          onDraftChange(committed);
          onCommit(committed);
          event.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

interface EditableStatusCellProps {
  value: DispatchStatus;
  listId: string;
  className: string;
  onCommit: (value: DispatchStatus) => void;
  onDraftChange: (value: DispatchStatus) => void;
}

interface ExcelColumnFilterProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}

function ExcelColumnFilter({ label, options, selected, onChange }: ExcelColumnFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const active = selected.length > 0;
  const visibleOptions = options.filter((option) =>
    (option || "Vazio").toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))
  );

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  const toggleValue = (value: string) => {
    if (!active) {
      onChange([value]);
      return;
    }
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    // Todas as opções marcadas equivalem a não aplicar filtro.
    onChange(next.length === options.length ? [] : next);
  };

  return (
    <div ref={rootRef} className="relative h-full w-full">
      <button
        type="button"
        aria-label={`Filtrar coluna ${label}`}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className={`flex h-5 w-full items-center justify-between gap-1 border px-1 text-[9px] font-semibold focus:outline-none focus:ring-1 focus:ring-[#217346] ${
          active
            ? "border-[#bf9000] bg-[#fff2cc] text-[#7f6000]"
            : "border-[#a6a6a6] bg-white text-slate-600"
        }`}
        title={active ? `${selected.length} valor(es) selecionado(s)` : "Mostrar filtro da coluna"}
      >
        <span className="truncate">{active ? `${selected.length} selecionado(s)` : "(Todos)"}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>

      {open && (
        <div
          className="excel-dark-popup absolute left-0 top-5 z-[90] w-56 border border-[#7f7f7f] bg-white p-2 text-left shadow-xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="mb-1 text-[10px] font-bold uppercase text-slate-700">{label}</div>
          <div className="mb-2 flex items-center border border-[#a6a6a6] bg-white px-1.5">
            <Search className="mr-1 h-3 w-3 shrink-0 text-slate-500" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar..."
              className="h-6 min-w-0 flex-1 text-[10px] text-slate-800 outline-none"
            />
          </div>
          <div className="mb-1 flex gap-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex-1 border border-[#a6a6a6] bg-[#f3f3f3] py-1 text-[9px] font-bold text-slate-700 hover:bg-[#e2f0d9]"
            >
              Selecionar todos
            </button>
            <button
              type="button"
              onClick={() => {
                onChange([]);
                setSearch("");
                setOpen(false);
              }}
              className="flex-1 border border-[#a6a6a6] bg-[#f3f3f3] py-1 text-[9px] font-bold text-slate-700 hover:bg-[#e2f0d9]"
            >
              Limpar filtro
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto border border-[#d0d0d0]">
            {visibleOptions.length ? visibleOptions.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-1.5 py-1 text-[10px] text-slate-800 hover:bg-[#e2f0d9]"
              >
                <input
                  type="checkbox"
                  checked={!active || selected.includes(option)}
                  onChange={() => toggleValue(option)}
                  className="accent-[#217346]"
                />
                <span className="truncate" title={option || "Vazio"}>{option || "Vazio"}</span>
              </label>
            )) : (
              <div className="px-2 py-3 text-center text-[10px] text-slate-500">Nenhum valor encontrado</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 w-full bg-[#217346] py-1 text-[10px] font-bold text-white hover:bg-[#185c37]"
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}

function EditableStatusCell({ value, listId, className, onCommit, onDraftChange }: EditableStatusCellProps) {
  const displayValue = value;
  const [draft, setDraft] = useState(displayValue);
  const editedRef = useRef(false);
  const committedValueRef = useRef(displayValue);

  useEffect(() => {
    if (editedRef.current) return;
    committedValueRef.current = displayValue;
    setDraft(displayValue);
  }, [displayValue]);

  const commit = () => {
    if (!editedRef.current) return;
    const typed = draft.trim().replace(/\s+/g, " ").toUpperCase();
    const normalized = typed;
    editedRef.current = false;
    committedValueRef.current = normalized;
    if (!normalized) {
      setDraft("");
      onCommit("");
      return;
    }
    setDraft(normalized);
    onCommit(normalized);
  };

  return (
    <input
      type="text"
      list={listId}
      value={draft}
      aria-label="Status do acionamento"
      autoComplete="off"
      onChange={(event) => {
        const next = event.target.value.toUpperCase();
        editedRef.current = true;
        setDraft(next);
        onDraftChange(next);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          const committed = committedValueRef.current;
          editedRef.current = false;
          setDraft(committed);
          onDraftChange(committed);
          onCommit(committed);
          event.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

export function DispatchGrid({
  dispatches,
  onDraftRow = () => undefined,
  onUpdateRow,
  onUpdateBatch,
  locations,
  saveState,
  cellSaveStates = {},
  readOnly = false,
  activeEditors = {},
  onActiveRowChange,
  reminderTimes = {},
  onSetReminder,
  onRemoveReminder,
  reminderVolume = 65,
  onReminderVolumeChange,
  onPreviewReminderSound,
}: DispatchGridProps) {
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("schedule_time");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [fleetDrafts, setFleetDrafts] = useState<Record<string, string>>({});
  const [columnSearch, setColumnSearch] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ColumnFilterKey, string[]>>>({});
  const tableRef = useRef<HTMLTableElement>(null);
  const gridCanvasRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{
    anchor: { row: number; column: number };
    focus: { row: number; column: number };
  } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<number[]>([]);
  const [columnWidths, setColumnWidths] = useState<number[]>([...COLUMN_WIDTHS]);
  const [gridZoom, setGridZoom] = useState(100);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [matchWholeCell, setMatchWholeCell] = useState(true);
  const [replaceResult, setReplaceResult] = useState<string>("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; column: number } | null>(null);
  const [reminderEditor, setReminderEditor] = useState<{
    dispatchId: string;
    driverName: string;
    time: string;
    x: number;
    y: number;
  } | null>(null);
  const [reminderError, setReminderError] = useState("");
  const undoStack = useRef<GridHistoryAction[]>([]);
  const redoStack = useRef<GridHistoryAction[]>([]);
  const visibleTableWidth = ROW_NUMBER_WIDTH + columnWidths.reduce(
    (total, width, index) => total + (hiddenColumns.includes(index) ? 0 : width),
    0
  );
  const scaledTableWidth = visibleTableWidth * (gridZoom / 100);

  const syncHorizontalScroll = (source: "grid" | "footer") => {
    const grid = gridCanvasRef.current;
    const footer = bottomScrollRef.current;
    if (!grid || !footer) return;
    if (source === "grid" && Math.abs(footer.scrollLeft - grid.scrollLeft) > 1) {
      footer.scrollLeft = grid.scrollLeft;
    }
    if (source === "footer" && Math.abs(grid.scrollLeft - footer.scrollLeft) > 1) {
      grid.scrollLeft = footer.scrollLeft;
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("dispatch-hidden-columns");
      if (saved) setHiddenColumns(JSON.parse(saved));
      const savedWidths = localStorage.getItem("dispatch-column-widths");
      if (savedWidths) {
        const parsed = JSON.parse(savedWidths) as number[];
        if (parsed.length === COLUMN_WIDTHS.length && parsed.every((width) => Number.isFinite(width))) {
          setColumnWidths(parsed.map((width, index) => Math.max(index < 2 ? COLUMN_WIDTHS[index] : 55, width)));
        }
      }
      const savedZoom = Number(localStorage.getItem("dispatch-grid-zoom"));
      if (Number.isFinite(savedZoom) && savedZoom >= 75 && savedZoom <= 150) setGridZoom(savedZoom);
    } catch { /* preferência local inválida: usa todas as colunas */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("dispatch-column-widths", JSON.stringify(columnWidths));
  }, [columnWidths]);

  useEffect(() => {
    localStorage.setItem("dispatch-grid-zoom", String(gridZoom));
  }, [gridZoom]);

  useEffect(() => {
    if (!isExpanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isExpanded]);


  // Status de acionamento disponíveis
  const STATUS_OPTIONS: DispatchStatus[] = [
    "ACIONADO",
    "ABONADO",
    "APOIO",
    "BALDEIO",
    "TROCA",
    "FALTA",
    "ATESTADO",
    "AFASTADO",
    "BATE E VOLTA",
    "SUSPENSÃO",
    "VIAGEM FECHADA",
  ];

  // Aprovadores
  const APPROVER_OPTIONS = ["ANDERSON", "ROBERTO", "LEOVEGILDO", "PENDENTE"];

  const handleCopy = (text: string, cellId: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedCell(cellId);
    setTimeout(() => setCopiedCell(null), 1500);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Cores de horário fiéis à planilha Excel
  const getHorarioBadge = (timeStr?: string | null, shift?: string | null) => {
    const t = (timeStr || "").trim();
    const s = (shift || "").toUpperCase();

    // O horário visível é a fonte principal da cor. O turno cadastrado é
    // usado apenas quando o condutor ainda não possui um horário reconhecido.
    if (t.startsWith("04:")) {
      return "flex min-h-8 w-full items-center justify-center bg-[#FFF2CC] text-[#7F4B00] font-bold text-[13px] whitespace-nowrap";
    }
    if (t.startsWith("12:")) {
      return "flex min-h-8 w-full items-center justify-center bg-[#DDEBF7] text-[#0369A1] font-bold text-[13px] whitespace-nowrap";
    }
    if (t.startsWith("20:")) {
      return "flex min-h-8 w-full items-center justify-center bg-[#EDE7F6] text-[#5B2C6F] font-bold text-[13px] whitespace-nowrap";
    }
    if (s === "A") return "flex min-h-8 w-full items-center justify-center bg-[#FFF2CC] text-[#7F4B00] font-bold text-[13px] whitespace-nowrap";
    if (s === "B") return "flex min-h-8 w-full items-center justify-center bg-[#DDEBF7] text-[#0369A1] font-bold text-[13px] whitespace-nowrap";
    if (s === "C") return "flex min-h-8 w-full items-center justify-center bg-[#EDE7F6] text-[#5B2C6F] font-bold text-[13px] whitespace-nowrap";
    return "flex min-h-8 w-full items-center justify-center bg-slate-100 text-slate-700 font-bold text-[13px] whitespace-nowrap";
  };

  // Badges de status operacional com cores exatas da planilha
  const getStatusBadge = (status: DispatchStatus) => {
    switch (status) {
      case "ACIONADO":
        return "bg-[#C6EFCE] text-[#006100] border-[#A9D08E]";
      case "ABONADO":
        return "bg-[#FFC7CE] text-[#9C0006] border-[#F4B084]";
      case "APOIO":
        return "bg-[#FFEB9C] text-[#9C5700] border-[#FFD966]";
      case "BALDEIO":
        return "bg-[#BF9000] text-[#1F1F1F] border-[#806000]";
      case "TROCA":
        return "bg-[#FFFF00] text-[#000000] border-[#BFBF00]";
      case "FALTA":
        return "bg-[#FF0000] text-[#FFFFFF] font-extrabold border-[#CC0000]";
      case "ATESTADO":
        return "bg-[#B8CCE4] text-[#1F497D] border-[#8DB4E2]";
      case "AFASTADO":
        return "bg-[#E1D5E7] text-[#604A7B] border-[#D5C2E0]";
      case "BATE E VOLTA":
        return "bg-[#FFE6CC] text-[#D76B00] border-[#F8CBAD]";
      case "SUSPENSÃO":
        return "bg-[#F2DCDB] text-[#953734] border-[#E6B8B7]";
      case "VIAGEM FECHADA":
        return "bg-[#DCE6F1] text-[#1F497D] border-[#B8CCE4]";
      default:
        return "bg-slate-100 text-slate-800 border-slate-300";
    }
  };

  const getStatusClass = (status: DispatchStatus) =>
    `excel-status-${status.toLowerCase().replaceAll(" ", "-").replace("ã", "a")}`;

  const filterOptions = useMemo(() => Object.fromEntries(
    FILTER_COLUMNS.map((key) => [key, Array.from(new Set([
      ...(key === "status" ? [""] : []),
      ...dispatches.map((row) => getColumnValue(row, key)).filter(Boolean),
    ]))
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))])
  ) as Record<ColumnFilterKey, string[]>, [dispatches]);

  // Filtragem e ordenação dos despachos
  const processedDispatches = useMemo(() => {
    let result = [...dispatches];

    if (columnSearch.trim()) {
      const q = columnSearch.toLowerCase().trim();
      result = result.filter(
        (row) =>
          row.driver.name.toLowerCase().includes(q) ||
          row.driver.login_matricula.toLowerCase().includes(q)
      );
    }

    result = result.filter((row) => FILTER_COLUMNS.every((key) => {
      const selectedValues = columnFilters[key];
      return !selectedValues?.length || selectedValues.includes(getColumnValue(row, key));
    }));

    return result.sort((a, b) => {
      let aVal: string | number | boolean | null = "";
      let bVal: string | number | boolean | null = "";

      if (sortField === "driver_name") {
        aVal = a.driver.name;
        bVal = b.driver.name;
      } else if (sortField === "login") {
        aVal = a.driver.login_matricula;
        bVal = b.driver.login_matricula;
      } else if (sortField === "schedule_time") {
        const shiftOrder: Record<string, number> = { A: 4, B: 12, C: 20 };
        const getScheduleHour = (row: DispatchRowModel) => {
          const parsedHour = Number.parseInt((row.driver.default_start_time || "").slice(0, 2), 10);
          if (Number.isFinite(parsedHour)) return parsedHour;
          return shiftOrder[(row.driver.default_shift || "").toUpperCase()] ?? 99;
        };
        aVal = getScheduleHour(a);
        bVal = getScheduleHour(b);
      } else {
        aVal = (a[sortField as keyof DispatchRowModel] as string | number | boolean | null) ?? "";
        bVal = (b[sortField as keyof DispatchRowModel] as string | number | boolean | null) ?? "";
      }

      if (aVal === null) aVal = "";
      if (bVal === null) bVal = "";

      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [dispatches, columnSearch, sortField, sortAsc, columnFilters]);

  const locationNames = useMemo(
    () => Array.from(new Set([
      ...locations.map((location) => location.name.trim()),
      ...dispatches.flatMap((row) => [row.destination_name || "", row.final_destination_name || ""]),
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [locations, dispatches]
  );

  const cellFeedback = (rowId: string, field: keyof DispatchRowModel) => {
    const feedback = cellSaveStates[`${rowId}:${String(field)}`];
    return feedback ? {
      "data-save-state": feedback.status,
      title: feedback.status === "error"
        ? feedback.message || "Erro ao salvar; a edição continua pendente."
        : feedback.status === "saving" ? "Salvando..." : feedback.status === "saved" ? "Salvo" : "Alteração pendente",
    } : {};
  };

  useEffect(() => {
    localStorage.setItem("dispatch-hidden-columns", JSON.stringify(hiddenColumns));
    const table = tableRef.current;
    if (!table) return;
    table.querySelectorAll("tr").forEach((row) => Array.from(row.children).forEach((cell, cellIndex) => {
      if (cellIndex > 0) (cell as HTMLElement).style.display = hiddenColumns.includes(cellIndex - 1) ? "none" : "";
    }));
    table.querySelectorAll("colgroup col").forEach((column, columnIndex) => {
      (column as HTMLElement).style.display = columnIndex > 0 && hiddenColumns.includes(columnIndex - 1) ? "none" : "";
    });
  }, [hiddenColumns, processedDispatches.length]);

  const selectionBounds = selection ? {
    top: Math.min(selection.anchor.row, selection.focus.row),
    bottom: Math.max(selection.anchor.row, selection.focus.row),
    left: Math.min(selection.anchor.column, selection.focus.column),
    right: Math.max(selection.anchor.column, selection.focus.column),
  } : null;

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    table.querySelectorAll("tbody td").forEach((cell) => cell.classList.remove("excel-range-selected"));
    if (!selection) return;
    const bounds = {
      top: Math.min(selection.anchor.row, selection.focus.row),
      bottom: Math.max(selection.anchor.row, selection.focus.row),
      left: Math.min(selection.anchor.column, selection.focus.column),
      right: Math.max(selection.anchor.column, selection.focus.column),
    };
    table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row, rowIndex) => {
      Array.from(row.cells).forEach((cell, cellIndex) => {
        const columnIndex = cellIndex - 1;
        if (rowIndex >= bounds.top && rowIndex <= bounds.bottom &&
            columnIndex >= bounds.left && columnIndex <= bounds.right) {
          cell.classList.add("excel-range-selected");
        }
      });
    });
  }, [selection]);

  useEffect(() => {
    const stopSelecting = () => setIsSelecting(false);
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener("mouseup", stopSelecting);
    window.addEventListener("blur", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);
    return () => {
      window.removeEventListener("mouseup", stopSelecting);
      window.removeEventListener("blur", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
    };
  }, []);

  const cellPosition = (target: EventTarget | null) => {
    const cell = target instanceof Element ? target.closest<HTMLTableCellElement>("tbody td") : null;
    const row = cell?.parentElement as HTMLTableRowElement | null;
    if (!cell || !row) return null;
    return { row: row.sectionRowIndex, column: cell.cellIndex - 1 };
  };

  const updateForPastedCell = (column: number, rawValue: string): Partial<DispatchRowModel> | null => {
    const value = rawValue.trim();
    switch (column) {
      case 3: return { forecast_start_time: value || null };
      case 4: return { dispatch_status: value.toUpperCase() };
      case 5: return { abono_reason: value || null };
      case 6: {
        const location = locations.find((item) => item.name.toUpperCase() === value.toUpperCase());
        return { origin_location_id: location?.id || null };
      }
      case 7: return { entry_time: value ? normalizeClockTime(value) : null };
      case 8: return { fleet_code: value.toUpperCase() };
      case 9: return { cargo_status: (value.toUpperCase() || null) as CargoStatus | null };
      case 10: return { destination_name: value.toUpperCase() };
      case 11: return { final_destination_name: value.toUpperCase() };
      case 12: return { exit_time: value ? normalizeClockTime(value) : null };
      case 13: return { observations: value || null };
      default: return null;
    }
  };

  const valueBeforeUpdate = (row: DispatchRowModel, key: keyof DispatchRowModel) => {
    if (key === "destination_name") {
      return row.destination_name ?? row.destination_location?.name ?? "";
    }
    if (key === "final_destination_name") {
      return row.final_destination_name ?? row.final_destination_location?.name ?? "";
    }
    if (key === "fleet_code") {
      return row.fleet_code ?? row.vehicle?.plate_code ?? "";
    }
    return row[key] ?? null;
  };

  const historyChangeFor = (id: string, updates: Partial<DispatchRowModel>): GridHistoryChange | null => {
    const current = dispatches.find((row) => row.id === id);
    if (!current) return null;
    const before = Object.fromEntries(
      Object.keys(updates).map((key) => [key, valueBeforeUpdate(current, key as keyof DispatchRowModel)])
    ) as Partial<DispatchRowModel>;
    return { id, before, after: updates };
  };

  const rememberAction = (changes: GridHistoryChange[]) => {
    if (!changes.length) return;
    undoStack.current.push({ changes });
    if (undoStack.current.length > 200) undoStack.current.shift();
    redoStack.current = [];
  };

  const commitUpdate = async (id: string, updates: Partial<DispatchRowModel>, recordHistory = true) => {
    if (readOnly) return false;
    const change = recordHistory ? historyChangeFor(id, updates) : null;
    try {
      await onUpdateRow(id, updates);
      if (change) rememberAction([change]);
      return true;
    } catch {
      // O estado de erro e o rascunho pendente são mantidos pela página.
      return false;
    }
  };

  const commitBatch = async (updatesByRow: Map<string, Partial<DispatchRowModel>>) => {
    if (readOnly) return false;
    const changes = Array.from(updatesByRow, ([id, updates]) => historyChangeFor(id, updates))
      .filter((change): change is GridHistoryChange => Boolean(change));
    try {
      await onUpdateBatch(updatesByRow);
      rememberAction(changes);
      return true;
    } catch {
      // A seleção continua dirty e pode ser reenviada pelo botão Atualizar.
      return false;
    }
  };

  const undo = async () => {
    const action = undoStack.current.pop();
    if (!action) return;
    for (const change of [...action.changes].reverse()) {
      await commitUpdate(change.id, change.before, false);
    }
    redoStack.current.push(action);
  };

  const redo = async () => {
    const action = redoStack.current.pop();
    if (!action) return;
    for (const change of action.changes) {
      await commitUpdate(change.id, change.after, false);
    }
    undoStack.current.push(action);
  };

  const copySelection = async () => {
    if (!selectionBounds) return;
    const text = Array.from({ length: selectionBounds.bottom - selectionBounds.top + 1 }, (_, rowOffset) => {
      const row = processedDispatches[selectionBounds.top + rowOffset];
      return Array.from({ length: selectionBounds.right - selectionBounds.left + 1 }, (_, columnOffset) => {
        const column = selectionBounds.left + columnOffset;
        return row && FILTER_COLUMNS[column] ? getColumnValue(row, FILTER_COLUMNS[column]) : "";
      }).join("\t");
    }).join("\n");
    await navigator.clipboard.writeText(text);
  };

  const clearSelection = async () => {
    if (!selectionBounds) return;
    const updatesByRow = new Map<string, Partial<DispatchRowModel>>();
    for (let rowIndex = selectionBounds.top; rowIndex <= selectionBounds.bottom; rowIndex++) {
      const row = processedDispatches[rowIndex];
      if (!row) continue;
      for (let column = selectionBounds.left; column <= selectionBounds.right; column++) {
        const updates = updateForPastedCell(column, "");
        if (updates) updatesByRow.set(row.id, { ...(updatesByRow.get(row.id) || {}), ...updates });
      }
    }
    await commitBatch(updatesByRow);
  };

  const fillSelection = async (direction: "down" | "right") => {
    if (!selectionBounds) return;
    const updatesByRow = new Map<string, Partial<DispatchRowModel>>();

    if (direction === "down") {
      const sourceRow = processedDispatches[selectionBounds.top];
      if (!sourceRow || selectionBounds.bottom <= selectionBounds.top) return;
      for (let rowIndex = selectionBounds.top + 1; rowIndex <= selectionBounds.bottom; rowIndex++) {
        const targetRow = processedDispatches[rowIndex];
        if (!targetRow) continue;
        for (let column = selectionBounds.left; column <= selectionBounds.right; column++) {
          const key = FILTER_COLUMNS[column];
          const updates = key ? updateForPastedCell(column, getColumnValue(sourceRow, key)) : null;
          if (updates) updatesByRow.set(targetRow.id, { ...(updatesByRow.get(targetRow.id) || {}), ...updates });
        }
      }
    } else {
      if (selectionBounds.right <= selectionBounds.left) return;
      for (let rowIndex = selectionBounds.top; rowIndex <= selectionBounds.bottom; rowIndex++) {
        const row = processedDispatches[rowIndex];
        const sourceKey = FILTER_COLUMNS[selectionBounds.left];
        if (!row || !sourceKey) continue;
        const sourceValue = getColumnValue(row, sourceKey);
        for (let column = selectionBounds.left + 1; column <= selectionBounds.right; column++) {
          const updates = updateForPastedCell(column, sourceValue);
          if (updates) updatesByRow.set(row.id, { ...(updatesByRow.get(row.id) || {}), ...updates });
        }
      }
    }

    await commitBatch(updatesByRow);
  };

  const selectAllCells = () => {
    if (!processedDispatches.length) return;
    setSelection({
      anchor: { row: 0, column: 0 },
      focus: { row: processedDispatches.length - 1, column: COLUMN_LABELS.length - 1 },
    });
  };

  const selectColumn = (column: number) => {
    if (!processedDispatches.length || column < 0) return;
    setSelection({
      anchor: { row: 0, column },
      focus: { row: processedDispatches.length - 1, column },
    });
  };

  const selectRow = (row: number) => {
    setSelection({
      anchor: { row, column: 0 },
      focus: { row, column: COLUMN_LABELS.length - 1 },
    });
  };

  const startColumnResize = (event: React.MouseEvent, column: number) => {
    if (column < 2) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[column];

    const resize = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(55, Math.min(480, startWidth + moveEvent.clientX - startX));
      setColumnWidths((current) => current.map((width, index) => index === column ? nextWidth : width));
    };
    const finish = () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", finish);
    };
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", finish);
  };

  const replaceValues = async () => {
    const needle = findText.trim();
    if (!needle) {
      setReplaceResult("Digite o valor que deseja localizar.");
      return;
    }

    const bounds = selectionBounds || {
      top: 0,
      bottom: processedDispatches.length - 1,
      left: 0,
      right: COLUMN_LABELS.length - 1,
    };
    const updatesByRow = new Map<string, Partial<DispatchRowModel>>();
    let changedCells = 0;
    const normalizedNeedle = needle.toLocaleUpperCase("pt-BR");
    const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    for (let rowIndex = bounds.top; rowIndex <= bounds.bottom; rowIndex++) {
      const row = processedDispatches[rowIndex];
      if (!row) continue;
      for (let column = bounds.left; column <= bounds.right; column++) {
        const key = FILTER_COLUMNS[column];
        if (!key) continue;
        const currentValue = getColumnValue(row, key);
        const matches = matchWholeCell
          ? currentValue.toLocaleUpperCase("pt-BR") === normalizedNeedle
          : currentValue.toLocaleUpperCase("pt-BR").includes(normalizedNeedle);
        if (!matches) continue;
        const nextValue = matchWholeCell
          ? replaceText
          : currentValue.replace(new RegExp(escapedNeedle, "gi"), replaceText);
        const updates = updateForPastedCell(column, nextValue);
        if (!updates) continue;
        updatesByRow.set(row.id, { ...(updatesByRow.get(row.id) || {}), ...updates });
        changedCells++;
      }
    }

    if (!changedCells) {
      setReplaceResult("Nenhuma célula editável encontrada.");
      return;
    }
    const saved = await commitBatch(updatesByRow);
    setReplaceResult(saved
      ? `${changedCells} célula(s) substituída(s) e salva(s).`
      : `${changedCells} célula(s) alterada(s), mas ainda pendente(s) de salvamento.`);
  };

  const moveSelection = (rowDelta: number, columnDelta: number, extend: boolean) => {
    if (!selection) return;
    let nextRow = Math.max(0, Math.min(processedDispatches.length - 1, selection.focus.row + rowDelta));
    let nextColumn = selection.focus.column + columnDelta;
    while (nextColumn >= 0 && nextColumn < COLUMN_LABELS.length && hiddenColumns.includes(nextColumn)) {
      nextColumn += columnDelta >= 0 ? 1 : -1;
    }
    nextColumn = Math.max(0, Math.min(COLUMN_LABELS.length - 1, nextColumn));
    const focus = { row: nextRow, column: nextColumn };
    setSelection((current) => current ? (extend ? { ...current, focus } : { anchor: focus, focus }) : null);
    requestAnimationFrame(() => {
      const cell = tableRef.current?.querySelectorAll<HTMLTableRowElement>("tbody tr")[nextRow]?.cells[nextColumn + 1];
      const control = cell?.querySelector<HTMLElement>("input,select");
      (control || cell)?.focus();
    });
  };

  const handleGridPaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (!selectionBounds) return;
    const matrix = event.clipboardData.getData("text/plain").replace(/\r/g, "").split("\n")
      .filter((line, index, rows) => line.length > 0 || index < rows.length - 1)
      .map((line) => line.split("\t"));
    if (!matrix.length) return;

    const singleValue = matrix.length === 1 && matrix[0].length === 1;
    const selectedCount = (selectionBounds.bottom - selectionBounds.top + 1) *
      (selectionBounds.right - selectionBounds.left + 1);
    // Uma célula simples continua usando a edição normal. Um bloco copiado,
    // mesmo colado a partir de uma única célula inicial, deve ser distribuído.
    if (selectedCount === 1 && singleValue) return;

    event.preventDefault();
    const updatesByRow = new Map<string, Partial<DispatchRowModel>>();
    const sourceColumnCount = Math.max(...matrix.map((row) => row.length));
    const targetIsRange = selectedCount > 1;
    const lastRow = targetIsRange
      ? selectionBounds.bottom
      : Math.min(processedDispatches.length - 1, selectionBounds.top + matrix.length - 1);
    const lastColumn = targetIsRange
      ? selectionBounds.right
      : selectionBounds.left + sourceColumnCount - 1;

    for (let rowIndex = selectionBounds.top; rowIndex <= lastRow; rowIndex++) {
      const row = processedDispatches[rowIndex];
      if (!row) continue;
      for (let column = selectionBounds.left; column <= lastColumn; column++) {
        const sourceRow = (rowIndex - selectionBounds.top) % matrix.length;
        const sourceColumn = (column - selectionBounds.left) % sourceColumnCount;
        const value = matrix[sourceRow]?.[sourceColumn];
        if (value === undefined) continue;
        const updates = updateForPastedCell(column, value);
        if (updates) updatesByRow.set(row.id, { ...(updatesByRow.get(row.id) || {}), ...updates });
      }
    }
    // Uma única gravação por condutor evita que atualizações simultâneas da
    // mesma linha se sobrescrevam quando o bloco contém várias colunas.
    await commitBatch(updatesByRow);
  };

  return (
    <div
      className={`excel-grid flex flex-1 flex-col overflow-hidden ${isExpanded ? "is-expanded fixed inset-0 z-[100] min-h-0 bg-white" : ""}`}
      tabIndex={0}
      onPaste={(event) => {
        if (readOnly) {
          event.preventDefault();
          return;
        }
        void handleGridPaste(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isExpanded) {
          event.preventDefault();
          setIsExpanded(false);
          return;
        }
        const key = event.key.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && key === "c") {
          event.preventDefault();
          copySelection();
          return;
        }
        if ((event.ctrlKey || event.metaKey) && key === "a") {
          event.preventDefault();
          selectAllCells();
          return;
        }
        if ((event.ctrlKey || event.metaKey) && key === "d") {
          event.preventDefault();
          fillSelection("down");
          return;
        }
        if ((event.ctrlKey || event.metaKey) && key === "r") {
          event.preventDefault();
          fillSelection("right");
          return;
        }
        if ((event.ctrlKey || event.metaKey) && key === "z") {
          event.preventDefault();
          event.shiftKey ? redo() : undo();
          return;
        }
        if ((event.ctrlKey || event.metaKey) && key === "y") {
          event.preventDefault();
          redo();
          return;
        }
        if (event.key === "Delete") {
          event.preventDefault();
          clearSelection();
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          moveSelection(0, event.shiftKey ? -1 : 1, false);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          moveSelection(event.shiftKey ? -1 : 1, 0, false);
          return;
        }
        const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
        if (editing) return;
        const directions: Record<string, [number, number]> = {
          ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
        };
        const direction = directions[event.key];
        if (direction) {
          event.preventDefault();
          moveSelection(direction[0], direction[1], event.shiftKey);
        }
      }}
    >
      <datalist id="dispatch-status-options">
        {STATUS_OPTIONS.map((status) => (
          <option key={status} value={status} />
        ))}
      </datalist>
      {reminderEditor && (
        <div
          className="dispatch-reminder-editor"
          style={{ left: reminderEditor.x, top: reminderEditor.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          role="dialog"
          aria-label={`Criar lembrete para ${reminderEditor.driverName}`}
        >
          <div className="dispatch-reminder-editor-title">
            <BellRing aria-hidden="true" />
            <div><strong>Lembrar de acionar</strong><span>{reminderEditor.driverName}</span></div>
            <button type="button" onClick={() => setReminderEditor(null)} aria-label="Fechar"><X /></button>
          </div>
          <label>
            Horário do alerta
            <input
              type="time"
              autoFocus
              value={reminderEditor.time}
              onChange={(event) => {
                setReminderError("");
                setReminderEditor((current) => current ? { ...current, time: event.target.value } : null);
              }}
            />
          </label>
          <div className="dispatch-reminder-volume">
            <div className="dispatch-reminder-volume-title">
              <span>Volume do alerta</span>
              <output htmlFor="dispatch-reminder-volume">{reminderVolume}%</output>
            </div>
            <div className="dispatch-reminder-volume-controls">
              {reminderVolume === 0 ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
              <input
                id="dispatch-reminder-volume"
                type="range"
                min="0"
                max="100"
                step="5"
                value={reminderVolume}
                aria-label="Volume do alerta"
                onChange={(event) => onReminderVolumeChange?.(Number(event.target.value))}
              />
              <button type="button" onClick={onPreviewReminderSound}>Testar</button>
            </div>
          </div>
          {reminderError && <p role="alert">{reminderError}</p>}
          <div className="dispatch-reminder-editor-actions">
            {reminderTimes[reminderEditor.dispatchId] && (
              <button
                type="button"
                className="is-delete"
                onClick={() => {
                  onRemoveReminder?.(reminderEditor.dispatchId);
                  setReminderEditor(null);
                }}
              ><Trash2 /> Remover</button>
            )}
            <button
              type="button"
              className="is-save"
              disabled={!reminderEditor.time}
              onClick={() => {
                const error = onSetReminder?.(
                  reminderEditor.dispatchId,
                  reminderEditor.driverName,
                  reminderEditor.time
                );
                if (error) setReminderError(error);
                else setReminderEditor(null);
              }}
            >Salvar alerta</button>
          </div>
          <small>O aviso aparecerá somente nesta sessão.</small>
        </div>
      )}
      <div className="excel-grid-actions relative flex items-center justify-end gap-2 border-b border-[#a6a6a6] bg-[#f3f3f3] px-2 py-1">
        <button
          type="button"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          className="flex items-center gap-1 border border-[#a6a6a6] bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-[#e2f0d9]"
          aria-pressed={isExpanded}
          title={isExpanded ? "Voltar ao tamanho normal (Esc)" : "Expandir planilha na janela"}
        >
          {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {isExpanded ? "Restaurar" : "Expandir"}
        </button>
        {hiddenColumns.length > 0 && (
          <span className="text-[10px] font-semibold text-slate-600">{hiddenColumns.length} oculta(s)</span>
        )}
        <button
          type="button"
          onClick={() => {
            setReplaceResult("");
            setShowFindReplace((open) => !open);
          }}
          className="flex items-center gap-1 border border-[#a6a6a6] bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-[#e2f0d9]"
          title="Localizar e substituir nas células selecionadas ou linhas visíveis"
        >
          <Search className="h-3.5 w-3.5" /> Localizar/substituir
        </button>
        <button
          type="button"
          onClick={() => setShowColumnMenu((open) => !open)}
          className="flex items-center gap-1 border border-[#a6a6a6] bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-[#e2f0d9]"
        >
          <Columns3 className="h-3.5 w-3.5" /> Colunas
        </button>
        {showFindReplace && (
          <div className="excel-dark-popup absolute right-24 top-8 z-[100] w-80 border border-[#7f7f7f] bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between border-b pb-1">
              <span className="text-xs font-bold text-slate-800">Localizar e substituir</span>
              <button type="button" onClick={() => setShowFindReplace(false)} aria-label="Fechar">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <label className="mb-2 block text-[10px] font-bold text-slate-700">
              Localizar
              <input
                type="text"
                value={findText}
                onChange={(event) => setFindText(event.target.value)}
                className="mt-0.5 h-7 w-full border border-[#a6a6a6] px-2 text-[11px] font-normal text-slate-900 outline-none focus:border-[#217346]"
              />
            </label>
            <label className="mb-2 block text-[10px] font-bold text-slate-700">
              Substituir por
              <input
                type="text"
                value={replaceText}
                onChange={(event) => setReplaceText(event.target.value)}
                className="mt-0.5 h-7 w-full border border-[#a6a6a6] px-2 text-[11px] font-normal text-slate-900 outline-none focus:border-[#217346]"
              />
            </label>
            <label className="mb-2 flex items-center gap-2 text-[10px] text-slate-700">
              <input
                type="checkbox"
                checked={matchWholeCell}
                onChange={(event) => setMatchWholeCell(event.target.checked)}
                className="accent-[#217346]"
              />
              Corresponder ao conteúdo inteiro da célula
            </label>
            <div className="mb-2 bg-[#f3f3f3] px-2 py-1 text-[9px] text-slate-600">
              {selectionBounds ? "Aplicação: intervalo selecionado" : "Aplicação: todas as linhas visíveis"}
            </div>
            {replaceResult && <div className="mb-2 text-[10px] font-semibold text-[#217346]">{replaceResult}</div>}
            <button
              type="button"
              onClick={replaceValues}
              disabled={!findText.trim()}
              className="w-full bg-[#217346] py-1.5 text-[10px] font-bold text-white hover:bg-[#185c37] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Substituir tudo e salvar
            </button>
          </div>
        )}
        {showColumnMenu && (
          <div className="excel-dark-popup absolute right-2 top-8 z-50 w-56 border border-[#7f7f7f] bg-white p-2 shadow-xl">
            <div className="mb-1 flex items-center justify-between border-b pb-1">
              <span className="text-xs font-bold text-slate-800">Exibir colunas</span>
              <button type="button" onClick={() => setShowColumnMenu(false)} aria-label="Fechar"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {COLUMN_LABELS.map((label, index) => {
                const visible = !hiddenColumns.includes(index);
                const protectedColumn = index < 2;
                return (
                  <button
                    type="button"
                    key={label}
                    disabled={protectedColumn}
                    onClick={() => setHiddenColumns((current) => visible
                      ? [...current, index]
                      : current.filter((column) => column !== index))}
                    className="flex w-full items-center gap-2 px-1.5 py-1 text-left text-[11px] text-slate-700 hover:bg-[#e2f0d9] disabled:cursor-not-allowed disabled:opacity-50"
                    title={protectedColumn ? "Coluna fixa protegida" : visible ? "Ocultar coluna" : "Reexibir coluna"}
                  >
                    {visible ? <Eye className="h-3.5 w-3.5 text-[#217346]" /> : <EyeOff className="h-3.5 w-3.5" />}
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setHiddenColumns([])}
              className="mt-2 w-full border border-[#a6a6a6] bg-[#f3f3f3] py-1 text-[10px] font-bold text-slate-700 hover:bg-[#e2f0d9]"
            >
              Mostrar todas
            </button>
            <button
              type="button"
              onClick={() => setColumnWidths([...COLUMN_WIDTHS])}
              className="mt-1 w-full border border-[#a6a6a6] bg-[#f3f3f3] py-1 text-[10px] font-bold text-slate-700 hover:bg-[#e2f0d9]"
            >
              Restaurar larguras
            </button>
          </div>
        )}
      </div>
      {/* Contêiner com rolagem horizontal e vertical */}
      <div
        ref={gridCanvasRef}
        onScroll={() => syncHorizontalScroll("grid")}
        className={`excel-grid-canvas relative select-none overflow-x-auto overflow-y-auto bg-white ${
          isExpanded ? "min-h-0 flex-1" : "h-[calc(100vh-210px)] min-h-[320px]"
        }`}
      >
        <table
          ref={tableRef}
          style={{
            width: visibleTableWidth,
            minWidth: visibleTableWidth,
            maxWidth: visibleTableWidth,
            zoom: gridZoom / 100,
          }}
          onMouseDown={(event) => {
            setContextMenu(null);
            const position = cellPosition(event.target);
            if (!position) return;
            onActiveRowChange?.(processedDispatches[position.row]?.id || null);
            setIsSelecting(true);
            setSelection((current) => event.shiftKey && current
              ? { ...current, focus: position }
              : { anchor: position, focus: position });
          }}
          onContextMenu={(event) => {
            const position = cellPosition(event.target);
            if (!position) return;
            event.preventDefault();
            const insideSelection = selectionBounds &&
              position.row >= selectionBounds.top && position.row <= selectionBounds.bottom &&
              position.column >= selectionBounds.left && position.column <= selectionBounds.right;
            if (!insideSelection) setSelection({ anchor: position, focus: position });
            setContextMenu({ x: event.clientX, y: event.clientY, column: position.column });
          }}
          onMouseOver={(event) => {
            if (!isSelecting) return;
            const position = cellPosition(event.target);
            if (position) setSelection((current) => current ? { ...current, focus: position } : null);
          }}
          className="text-left border-collapse table-fixed text-[11px]"
        >
          {/* Definição estrita das larguras de colunas */}
          <colgroup>
            <col style={{ width: ROW_NUMBER_WIDTH }} />
            {columnWidths.map((width, index) => (
              <col key={COLUMN_LABELS[index]} style={{ width }} />
            ))}
          </colgroup>

          {/* Cabeçalho Fixo */}
          <thead className="sticky top-0 z-30">
            <tr className="excel-column-letters h-5">
              <th
                className="sticky left-0 z-40 cursor-pointer text-center hover:!bg-[#d9ead3]"
                title="Selecionar toda a grade"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  selectAllCells();
                }}
              >#</th>
              {"ABCDEFGHIJKLMNOPQ".split("").map((letter, column) => (
                <th
                  key={letter}
                  className={`${column === 0 ? "sticky left-[44px] z-30" : column === 1 ? "sticky left-[274px] z-30" : "relative"} cursor-pointer text-center hover:!bg-[#d9ead3]`}
                  title={`Selecionar coluna ${letter}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    selectColumn(column);
                  }}
                >
                  {letter}
                  {column >= 2 && (
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Redimensionar coluna ${letter}`}
                      title="Arraste para ajustar a largura"
                      onMouseDown={(event) => startColumnResize(event, column)}
                      className="absolute right-[-3px] top-0 z-50 h-full w-[7px] cursor-col-resize hover:bg-[#217346]"
                    />
                  )}
                </th>
              ))}
            </tr>
            <tr className="h-9">
              <th className="excel-row-number sticky left-0 z-40 text-center border-r border-slate-400 font-bold">#</th>
              
              {/* Coluna 1: CONDUTOR (Fixada à esquerda com Pesquisa Integrada) */}
              <th className="px-2 py-1 sticky left-[44px] z-30 border-r border-emerald-700">
                <div className="flex items-center justify-between gap-1">
                  {isSearching ? (
                    <div className="flex items-center flex-1 bg-white border border-emerald-300 rounded px-1.5 py-0.5 text-slate-800 shadow-inner">
                      <Search className="w-3 h-3 text-emerald-700 shrink-0 mr-1" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Filtrar condutor..."
                        value={columnSearch}
                        onChange={(e) => setColumnSearch(e.target.value)}
                        className="bg-transparent text-slate-900 text-xs w-full focus:outline-none font-sans font-semibold"
                      />
                      <button
                        onClick={() => {
                          setColumnSearch("");
                          setIsSearching(false);
                        }}
                        className="text-slate-500 hover:text-slate-900 ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        onClick={() => handleSort("driver_name")}
                        className="flex items-center space-x-1 cursor-pointer truncate flex-1 hover:text-emerald-100 transition-colors"
                      >
                        <span className="truncate font-bold tracking-wide">CONDUTOR</span>
                        <ArrowUpDown className="w-3 h-3 opacity-80 ml-0.5 shrink-0" />
                      </div>
                      <button
                        onClick={() => setIsSearching(true)}
                        className={`p-1 rounded hover:bg-emerald-800 transition-colors ${
                          columnSearch ? "text-amber-200 bg-emerald-900" : "text-emerald-100"
                        }`}
                        title="Pesquisar condutor na grade"
                      >
                        <Search className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </th>

              {/* Coluna 2: LOGIN (Fixada à esquerda) */}
              <th
                onClick={() => handleSort("login")}
                className="px-2 py-1.5 sticky left-[274px] z-30 border-r border-emerald-700 cursor-pointer text-center"
              >
                <div className="flex items-center justify-center space-x-1 hover:text-emerald-100">
                  <span className="font-bold tracking-wide">LOGIN</span>
                  <ArrowUpDown className="w-3 h-3 opacity-80 shrink-0" />
                </div>
              </th>

              {/* Coluna 3: HORÁRIO (Com destaque de turno) */}
              <th
                onClick={() => handleSort("schedule_time")}
                title="Agrupar por turno: 04h, 12h e 20h"
                className="px-2 py-1.5 border-r border-emerald-700 cursor-pointer hover:bg-emerald-800 transition-colors text-center"
              >
                <div className="flex items-center justify-center space-x-1">
                  <span className="font-bold">HORÁRIO</span>
                  <ArrowUpDown className="w-3 h-3 opacity-80 shrink-0" />
                </div>
              </th>

              {/* Coluna 4: PREVISÃO */}
              <th
                onClick={() => handleSort("forecast_start_time")}
                className="px-2 py-1.5 border-r border-emerald-700 cursor-pointer hover:bg-emerald-800 transition-colors text-center"
              >
                <div className="flex items-center justify-center space-x-1">
                  <span className="font-bold">PREVISÃO</span>
                  <ArrowUpDown className="w-3 h-3 opacity-80 shrink-0" />
                </div>
              </th>

              {/* Coluna 5: ACIONADO / STATUS */}
              <th
                onClick={() => handleSort("dispatch_status")}
                className="px-2 py-1.5 border-r border-emerald-700 cursor-pointer hover:bg-emerald-800 transition-colors text-center"
              >
                <div className="flex items-center justify-center space-x-1">
                  <span className="font-bold">STATUS</span>
                  <ArrowUpDown className="w-3 h-3 opacity-80 shrink-0" />
                </div>
              </th>

              {/* Coluna 6: MOTIVO DO ABONO */}
              <th className="px-2 py-1.5 border-r border-emerald-700 font-bold">
                MOTIVO DO ABONO / APROVAÇÃO
              </th>

              {/* Coluna 7: LOCAL */}
              <th className="px-2 py-1.5 border-r border-emerald-700 text-center font-bold">
                LOCAL
              </th>

              {/* Coluna 8: ENTRADA */}
              <th className="px-2 py-1.5 border-r border-emerald-700 text-center font-bold">
                ENTRADA
              </th>

              {/* Coluna 9: FROTA */}
              <th className="px-2 py-1.5 border-r border-emerald-700 text-center font-bold">
                FROTA
              </th>

              {/* Coluna 10: C/V */}
              <th className="px-1.5 py-1.5 border-r border-emerald-700 text-center font-bold">
                C/V
              </th>

              {/* Coluna 11: DESTINO */}
              <th className="px-2 py-1.5 border-r border-emerald-700 font-bold">
                DESTINO
              </th>

              {/* Coluna 12: DESTINO FINAL */}
              <th className="px-2 py-1.5 border-r border-emerald-700 font-bold">
                DESTINO FINAL
              </th>

              {/* Coluna 13: SAÍDA */}
              <th className="px-2 py-1.5 border-r border-emerald-700 text-center font-bold">
                SAÍDA
              </th>

              {/* Coluna 14: OBSERVAÇÃO */}
              <th className="px-2 py-1.5 border-r border-emerald-700 font-bold">
                OBSERVAÇÃO
              </th>

              {/* Coluna 15: DIA DE ESCALA */}
              <th className="px-2 py-1.5 border-r border-emerald-700 text-center font-bold">
                DIA ESC.
              </th>

              {/* Coluna 16: PREV. PRÓX. */}
              <th className="px-2 py-1.5 border-r border-emerald-700 text-center text-amber-200 font-bold">
                PREV. PRÓX.
              </th>

              {/* Coluna 17: TEMPO DE JORNADA */}
              <th className="px-2 py-1.5 text-center text-amber-100 font-bold">
                TEMPO JORNADA
              </th>
            </tr>
            <tr className="h-7 bg-[#e7e6e6]">
              <th className="excel-row-number sticky left-0 z-40 border-r border-slate-400" />
              {FILTER_COLUMNS.map((key, index) => {
                const stickyClass = index === 0
                  ? "sticky left-[44px] z-30"
                  : index === 1
                    ? "sticky left-[274px] z-30"
                    : "";
                return (
                  <th key={key} className={`${stickyClass} bg-[#e7e6e6] border-r border-b border-[#b7b7b7] p-0.5`}>
                    <ExcelColumnFilter
                      label={COLUMN_LABELS[index]}
                      options={filterOptions[key]}
                      selected={columnFilters[key] || []}
                      onChange={(values) => setColumnFilters((current) => ({ ...current, [key]: values }))}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Corpo da Tabela */}
          <tbody className={`text-[11px] ${readOnly ? "opacity-90" : ""}`} inert={readOnly}>
            {processedDispatches.map((row, index) => {
              const hasAbonoPending =
                row.abono_authorized_by === "PENDENTE" && row.dispatch_status === "ABONADO";
              const rowEditors = activeEditors[row.id] || [];
              const isCastilhoDriver = row.base?.code?.trim().toUpperCase() === "CASTILHO";
              const rowFeedback = Object.entries(cellSaveStates)
                .filter(([key]) => key.startsWith(`${row.id}:`))
                .map(([, feedback]) => feedback)
                .sort((a, b) => ["error", "saving", "pending", "saved"].indexOf(a.status) - ["error", "saving", "pending", "saved"].indexOf(b.status))[0];

              return (
                <tr
                  key={row.id}
                  onClick={() => {
                    setSelectedRow(row.id);
                    onActiveRowChange?.(row.id);
                  }}
                  className={`h-8 ${selectedRow === row.id ? "excel-selected-row" : ""} ${
                    hasAbonoPending ? "bg-amber-50" : ""
                  } ${rowEditors.length ? "excel-collaborator-row" : ""}`}
                  data-save-state={rowFeedback?.status}
                  title={rowFeedback?.status === "error"
                    ? rowFeedback.message || "Esta linha possui uma edição que ainda não foi salva."
                    : rowEditors.length ? `${rowEditors.join(", ")} está nesta linha` : undefined}
                >
                  <td
                    className="excel-row-number sticky left-0 z-20 cursor-pointer text-center hover:bg-[#d9ead3]"
                    title={`Selecionar linha ${index + 1}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      selectRow(index);
                    }}
                  >
                    {index + 1}
                  </td>

                  {/* 1. CONDUTOR (Fixado - Texto Escuro e Nítido) */}
                  <td className={`sticky left-[44px] z-20 px-2.5 py-1 font-sans font-semibold group overflow-hidden border-r border-slate-300 ${
                    isCastilhoDriver ? "excel-driver-castilho" : ""
                  }`}>
                    <div className="flex items-center justify-between gap-1 overflow-hidden">
                      <span className="excel-driver-name-value truncate text-slate-900 font-bold text-xs" title={row.driver.name}>
                        {row.driver.name}
                      </span>
                      {rowEditors.length > 0 && (
                        <span className="excel-row-editor shrink-0" title={`${rowEditors.join(", ")} está nesta linha`}>
                          {rowEditors[0]}{rowEditors.length > 1 ? ` +${rowEditors.length - 1}` : ""}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();
                          const editorWidth = 270;
                          const x = Math.min(rect.left, window.innerWidth - editorWidth - 12);
                          const y = Math.min(rect.bottom + 5, window.innerHeight - 300);
                          setReminderError("");
                          setReminderEditor({
                            dispatchId: row.id,
                            driverName: row.driver.name,
                            time: reminderTimes[row.id] || "",
                            x: Math.max(8, x),
                            y: Math.max(8, y),
                          });
                        }}
                        className={`dispatch-reminder-button shrink-0 ${reminderTimes[row.id] ? "is-active" : ""}`}
                        title={reminderTimes[row.id]
                          ? `Alerta definido para ${reminderTimes[row.id]}`
                          : `Criar alerta para acionar ${row.driver.name}`}
                        aria-label={reminderTimes[row.id]
                          ? `Alterar alerta de ${row.driver.name}, marcado para ${reminderTimes[row.id]}`
                          : `Criar alerta para ${row.driver.name}`}
                      >
                        {reminderTimes[row.id] ? <BellRing /> : <Bell />}
                        {reminderTimes[row.id] && <span>{reminderTimes[row.id]}</span>}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(row.driver.name, `cond-${row.id}`);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-emerald-700 transition-opacity ml-1 shrink-0 text-slate-400"
                        title="Copiar Nome"
                      >
                        {copiedCell === `cond-${row.id}` ? (
                          <Check className="w-3 h-3 text-emerald-600 font-bold" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* 2. LOGIN (Fixado - Texto Escuro e Nítido) */}
                  <td className="sticky left-[274px] z-20 px-2 py-1 text-center group border-r border-slate-300 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="mx-auto text-slate-800 font-bold text-xs">{row.driver.login_matricula}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(row.driver.login_matricula, `login-${row.id}`);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-emerald-700 transition-opacity shrink-0 text-slate-400"
                        title="Copiar Login"
                      >
                        {copiedCell === `login-${row.id}` ? (
                          <Check className="w-3 h-3 text-emerald-600 font-bold" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* 3. HORÁRIO (Com cores de turno 04h, 12h, 20h) */}
                  <td className="p-0 text-center whitespace-nowrap">
                    <span className={getHorarioBadge(row.driver.default_start_time, row.driver.default_shift)}>
                      {row.driver.default_start_time ? row.driver.default_start_time.slice(0, 5) : "--:--"}
                    </span>
                  </td>

                  {/* 4. PREVISÃO */}
                  <td className="px-1 py-1 text-center" {...cellFeedback(row.id, "forecast_start_time")}>
                    <EditableTextCell
                      value={row.forecast_start_time || ""}
                      placeholder={row.forecast_source === "CONTINUITY" ? "AGUARD. SAÍDA" : "INSERIR"}
                      onCommit={(value) => commitUpdate(row.id, { forecast_start_time: value || null })}
                      onDraftChange={(value) => onDraftRow(row.id, { forecast_start_time: value || null })}
                      className="w-full text-center text-slate-900 font-mono font-medium placeholder-slate-400 focus:bg-white focus:outline-none rounded px-1"
                    />
                  </td>

                  {/* 5. ACIONADO / STATUS */}
                  <td className={`px-1 py-1 text-center excel-status-cell ${getStatusClass(row.dispatch_status)}`} {...cellFeedback(row.id, "dispatch_status")}>
                    <EditableStatusCell
                      value={row.dispatch_status}
                      listId="dispatch-status-options"
                      onCommit={(value) => commitUpdate(row.id, { dispatch_status: value })}
                      onDraftChange={(value) => onDraftRow(row.id, { dispatch_status: value })}
                      className={`excel-status-select w-full py-0.5 px-1 rounded text-center text-[10px] font-extrabold border cursor-pointer focus:outline-none shadow-xs ${getStatusClass(
                        row.dispatch_status
                      )}`}
                    />
                  </td>

                  {/* 6. MOTIVO DO ABONO / APROVAÇÃO */}
                  <td className="px-1.5 py-1" {...cellFeedback(row.id, "abono_reason")}>
                    <div className="flex w-full min-w-0 items-center gap-1 overflow-hidden">
                      <EditableTextCell
                        value={row.abono_reason || ""}
                        placeholder="Motivo da ocorrência..."
                        onCommit={(value) => commitUpdate(row.id, { abono_reason: value || null })}
                        onDraftChange={(value) => onDraftRow(row.id, { abono_reason: value || null })}
                        className="w-0 min-w-0 flex-1 text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none rounded px-1 text-[11px] truncate font-sans"
                      />
                      {row.dispatch_status === "ABONADO" || row.abono_reason ? (
                        <select
                          value={row.abono_authorized_by || "PENDENTE"}
                          onChange={(e) => commitUpdate(row.id, { abono_authorized_by: e.target.value })}
                          className={`w-[94px] min-w-0 shrink-0 text-[9px] px-1 py-0.5 rounded border font-bold ${
                            row.abono_authorized_by === "PENDENTE"
                              ? "bg-amber-100 text-amber-900 border-amber-400"
                              : "bg-slate-100 text-slate-700 border-slate-300"
                          }`}
                          title="Autorizado Por"
                        >
                          {APPROVER_OPTIONS.map((app) => (
                            <option key={app} value={app}>
                              {app}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  </td>

                  {/* 7. LOCAL */}
                  <td className="px-1 py-1 text-center" {...cellFeedback(row.id, "origin_location_id")}>
                    <span className="block w-full text-center font-semibold text-slate-900">
                      {locations.find((location) => location.id === row.origin_location_id)?.name
                        ?? row.origin_location?.name
                        ?? ""}
                    </span>
                  </td>

                  {/* 8. ENTRADA */}
                  <td className="px-1 py-1 text-center" {...cellFeedback(row.id, "entry_time")}>
                    <EditableTextCell
                      value={row.entry_time || ""}
                      placeholder="--:--:--"
                      onCommit={(value) => commitUpdate(row.id, {
                        entry_time: value ? normalizeClockTime(value) : null,
                      })}
                      onDraftChange={(value) => onDraftRow(row.id, {
                        entry_time: value ? normalizeClockTime(value) : null,
                      })}
                      className="w-full text-center text-slate-900 font-mono font-medium placeholder-slate-400 focus:bg-white focus:outline-none rounded px-1"
                    />
                  </td>

                  {/* 9. FROTA (Digitação Livre) */}
                  <td className="px-1 py-1 text-center" {...cellFeedback(row.id, "fleet_code")}>
                    <input
                      type="text"
                      value={fleetDrafts[row.id] ?? (row.fleet_code || row.vehicle?.plate_code || "")}
                      placeholder="Ex: ABC1234"
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        setFleetDrafts((prev) => ({ ...prev, [row.id]: value }));
                        onDraftRow(row.id, { fleet_code: value });
                      }}
                      onBlur={(e) => {
                        const value = e.target.value.trim().toUpperCase();
                        setFleetDrafts((prev) => {
                          const copy = { ...prev };
                          delete copy[row.id];
                          return copy;
                        });
                        commitUpdate(row.id, { fleet_code: value });
                      }}
                      className="w-full text-center text-slate-900 font-mono font-bold uppercase placeholder-slate-400 focus:bg-white focus:outline-none rounded px-1"
                    />
                  </td>

                  {/* 10. C/V */}
                  <td className="px-0.5 py-1 text-center" {...cellFeedback(row.id, "cargo_status")}>
                    <EditableTextCell
                      value={row.cargo_status || ""}
                      placeholder="C/V"
                      onCommit={(value) => commitUpdate(row.id, {
                        cargo_status: (value.trim().toUpperCase() || null) as CargoStatus | null,
                      })}
                      onDraftChange={(value) => onDraftRow(row.id, {
                        cargo_status: (value.trim().toUpperCase() || null) as CargoStatus | null,
                      })}
                      className="w-full text-center font-extrabold uppercase text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none rounded px-1"
                    />
                  </td>

                  {/* 11. DESTINO */}
                  <td className="px-0 py-0" {...cellFeedback(row.id, "destination_name")}>
                    <EditableLocationCell
                      value={row.destination_name ?? row.destination_location?.name ?? ""}
                      options={locationNames}
                      label={`Destino de ${row.driver.name}`}
                      onCommit={(value) => commitUpdate(row.id, { destination_name: value })}
                      onDraftChange={(value) => onDraftRow(row.id, { destination_name: value })}
                    />
                  </td>

                  {/* 12. DESTINO FINAL */}
                  <td className="px-0 py-0" {...cellFeedback(row.id, "final_destination_name")}>
                    <EditableLocationCell
                      value={row.final_destination_name ?? row.final_destination_location?.name ?? ""}
                      options={locationNames}
                      label={`Destino final de ${row.driver.name}`}
                      onCommit={(value) => commitUpdate(row.id, { final_destination_name: value })}
                      onDraftChange={(value) => onDraftRow(row.id, { final_destination_name: value })}
                    />
                  </td>

                  {/* 13. SAÍDA */}
                  <td className="px-1 py-1 text-center" {...cellFeedback(row.id, "exit_time")}>
                    <EditableTextCell
                      value={row.exit_time || ""}
                      placeholder="--:--:--"
                      onCommit={(value) => commitUpdate(row.id, {
                        exit_time: value ? normalizeClockTime(value) : null,
                      })}
                      onDraftChange={(value) => onDraftRow(row.id, {
                        exit_time: value ? normalizeClockTime(value) : null,
                      })}
                      className="w-full text-center text-slate-900 font-mono font-medium placeholder-slate-400 focus:bg-white focus:outline-none rounded px-1"
                    />
                  </td>

                  {/* 14. OBSERVAÇÃO */}
                  <td className="px-1.5 py-1" {...cellFeedback(row.id, "observations")}>
                    <EditableTextCell
                      value={row.observations || ""}
                      placeholder="Notas..."
                      onCommit={(value) => commitUpdate(row.id, { observations: value || null })}
                      onDraftChange={(value) => onDraftRow(row.id, { observations: value || null })}
                      className="w-full text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none rounded px-1 text-[11px] truncate font-sans"
                    />
                  </td>

                  {/* 15. DIA DE ESCALA */}
                  <td className="px-1 py-1 text-center font-bold text-slate-800">
                    {row.scale_day_status || "-"}
                  </td>

                  {/* 16. PREV. PRÓX. DIA */}
                  <td className="px-1 py-1 text-center font-bold text-emerald-700">
                    {row.next_day_forecast_time ? row.next_day_forecast_time.slice(0, 5) : "--:--"}
                  </td>

                  {/* 17. TEMPO DE JORNADA */}
                  <td className="px-1.5 py-1 text-center font-bold">
                    {row.is_ongoing ? (
                      <span className="flex items-center justify-center space-x-1 text-emerald-700 animate-pulse font-bold">
                        <Clock className="w-3 h-3 inline mr-0.5" />
                        <span>{row.formatted_worked_time}</span>
                      </span>
                    ) : row.formatted_worked_time ? (
                      <span
                        className={
                          (row.total_worked_minutes || 0) > 600
                            ? "text-rose-600 font-extrabold"
                            : "text-slate-900"
                        }
                      >
                        {row.formatted_worked_time}
                      </span>
                    ) : (
                      <span className="text-slate-400">--:--</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!processedDispatches.length && (
              <tr>
                <td colSpan={18} className="py-10 text-center text-slate-500 font-sans">
                  Nenhum registro encontrado para os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {contextMenu && (
        <div
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="excel-dark-popup fixed z-[120] w-44 border border-[#7f7f7f] bg-white py-1 text-[11px] text-slate-800 shadow-xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await copySelection();
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#e2f0d9]"
          >
            <Copy className="h-3.5 w-3.5" /> Copiar seleção
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await clearSelection();
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#e2f0d9]"
          >
            <X className="h-3.5 w-3.5" /> Limpar conteúdo
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={contextMenu.column < 2}
            onClick={() => {
              setHiddenColumns((current) => current.includes(contextMenu.column)
                ? current
                : [...current, contextMenu.column]);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#e2f0d9] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <EyeOff className="h-3.5 w-3.5" /> Ocultar coluna
          </button>
        </div>
      )}
      <div
        ref={bottomScrollRef}
        onScroll={() => syncHorizontalScroll("footer")}
        className="excel-grid-bottom-scroll h-4 overflow-x-auto overflow-y-hidden"
        aria-label="Rolagem horizontal da planilha"
      >
        <div style={{ width: scaledTableWidth, height: 1 }} />
      </div>
      <div className="excel-statusbar overflow-hidden" role="status" aria-live="polite">
        <span className={`excel-save-dot is-${saveState.status}`} />
        <span className="min-w-0 truncate">
          {saveState.status === "saving" && "Salvando alteração..."}
          {saveState.status === "saved" && "Alteração salva"}
          {saveState.status === "error" && (saveState.message || "Erro ao salvar alteração")}
          {saveState.status === "idle" && (readOnly ? "Folha fechada — somente leitura" : saveState.message || "Pronto")}
        </span>
        <span className="ml-auto hidden shrink-0 sm:inline">{processedDispatches.length} linhas</span>
        <span className="hidden shrink-0 border-l border-slate-300 pl-2 2xl:inline">Ctrl+C · Ctrl+V · Delete · Ctrl+Z · Ctrl+D · Ctrl+R</span>
        <div className="ml-auto flex shrink-0 items-center gap-1 border-l border-slate-300 pl-2" aria-label="Zoom da planilha">
          <button
            type="button"
            onClick={() => setGridZoom((current) => Math.max(75, current - 5))}
            disabled={gridZoom <= 75}
            className="flex h-5 w-5 items-center justify-center hover:bg-white disabled:opacity-40"
            aria-label="Diminuir zoom"
            title="Diminuir zoom"
          >
            <Minus className="h-3 w-3" />
          </button>
          <input
            type="range"
            min="75"
            max="150"
            step="5"
            value={gridZoom}
            onChange={(event) => setGridZoom(Number(event.target.value))}
            className="!h-1 !min-h-0 w-24 cursor-pointer accent-[#217346]"
            aria-label="Zoom da planilha em porcentagem"
          />
          <button
            type="button"
            onClick={() => setGridZoom((current) => Math.min(150, current + 5))}
            disabled={gridZoom >= 150}
            className="flex h-5 w-5 items-center justify-center hover:bg-white disabled:opacity-40"
            aria-label="Aumentar zoom"
            title="Aumentar zoom"
          >
            <Plus className="h-3 w-3" />
          </button>
          <span className="w-9 text-right tabular-nums">{gridZoom}%</span>
        </div>
      </div>
    </div>
  );
}
