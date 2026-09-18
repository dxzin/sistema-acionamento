"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/lib/auth-context";
import { createDriver, DriverCatalog, DriverFormData, loadDriverCatalog, updateDriver, SCALE_LETTERS } from "@/lib/services/driver-service";
import { Base, Driver } from "@/types/database";
import {
  AlertCircle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Edit3,
  Loader2,
  Plus,
  Search,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";

const EMPTY_FORM: DriverFormData = {
  name: "",
  login_matricula: "",
  base_id: "",
  default_shift: "B",
  default_start_time: "12:00",
  is_active: true,
};

function getShiftBadge(shift?: string | null) {
  const s = (shift || "").toUpperCase().trim();
  if (s === "A") return "bg-[#FFF2CC] text-[#7F4B00] border border-[#FDE68A] font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs";
  if (s === "B") return "bg-[#DDEBF7] text-[#0369A1] border border-[#BAE6FD] font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs";
  if (s === "C") return "bg-[#EDE7F6] text-[#5B2C6F] border border-[#DDD6FE] font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs";
  return "bg-slate-100 text-slate-700 border border-slate-300 font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap";
}

function getHorarioBadge(timeStr?: string | null, shift?: string | null) {
  const t = (timeStr || "").trim();
  const s = (shift || "").toUpperCase().trim();

  if (t.startsWith("04:")) {
    return "bg-[#FFF2CC] text-[#7F4B00] border border-[#FDE68A] font-bold px-2.5 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs font-mono";
  }
  if (t.startsWith("12:")) {
    return "bg-[#DDEBF7] text-[#0369A1] border border-[#BAE6FD] font-bold px-2.5 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs font-mono";
  }
  if (t.startsWith("20:")) {
    return "bg-[#EDE7F6] text-[#5B2C6F] border border-[#DDD6FE] font-bold px-2.5 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs font-mono";
  }
  if (s === "A") return "bg-[#FFF2CC] text-[#7F4B00] border border-[#FDE68A] font-bold px-2.5 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs font-mono";
  if (s === "B") return "bg-[#DDEBF7] text-[#0369A1] border border-[#BAE6FD] font-bold px-2.5 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs font-mono";
  if (s === "C") return "bg-[#EDE7F6] text-[#5B2C6F] border border-[#DDD6FE] font-bold px-2.5 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs font-mono";
  return "bg-slate-100 text-slate-700 border border-slate-300 font-bold px-2.5 py-0.5 rounded text-[11px] whitespace-nowrap font-mono";
}

type SortField = "name" | "login_matricula" | "base" | "default_shift" | "default_start_time" | "is_active";

export default function CondutoresPage() {
  const { user } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [bases, setBases] = useState<Base[]>([]);
  const [source, setSource] = useState<DriverCatalog["source"]>("demo");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [baseFilter, setBaseFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<DriverFormData>(EMPTY_FORM);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);

  const [sortField, setSortField] = useState<SortField>("name");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [columnSearch, setColumnSearch] = useState("");
  const [isSearchingHeader, setIsSearchingHeader] = useState(false);

  useEffect(() => {
    loadDriverCatalog()
      .then((catalog) => {
        setDrivers(catalog.drivers);
        setBases(catalog.bases);
        setSource(catalog.source);
        setForm((current) => ({ ...current, base_id: catalog.bases[0]?.id || "" }));
      })
      .catch((reason: Error) => setError(`Não foi possível acessar o Supabase: ${reason.message}`))
      .finally(() => setLoading(false));
  }, []);

  const baseById = useMemo(() => new Map(bases.map((base) => [base.id, base])), [bases]);

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
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const colQuery = columnSearch.trim().toLocaleLowerCase("pt-BR");

    return drivers
      .filter((driver) => {
        const matchesToolbarSearch =
          !query ||
          driver.name.toLocaleLowerCase("pt-BR").includes(query) ||
          driver.login_matricula.toLowerCase().includes(query);

        const matchesColSearch =
          !colQuery ||
          driver.name.toLocaleLowerCase("pt-BR").includes(colQuery) ||
          driver.login_matricula.toLowerCase().includes(colQuery);

        const matchesStatus =
          statusFilter === "all" || (statusFilter === "active" ? driver.is_active : !driver.is_active);

        const matchesBase =
          baseFilter === "all" || driver.base_id === baseFilter;

        return matchesToolbarSearch && matchesColSearch && matchesStatus && matchesBase;
      })
      .sort((a, b) => {
        let aVal: string | boolean = "";
        let bVal: string | boolean = "";

        if (sortField === "name") {
          aVal = a.name;
          bVal = b.name;
        } else if (sortField === "login_matricula") {
          aVal = a.login_matricula;
          bVal = b.login_matricula;
        } else if (sortField === "base") {
          aVal = baseById.get(a.base_id)?.code || "";
          bVal = baseById.get(b.base_id)?.code || "";
        } else if (sortField === "default_shift") {
          aVal = a.default_shift || "";
          bVal = b.default_shift || "";
        } else if (sortField === "default_start_time") {
          aVal = a.default_start_time || "";
          bVal = b.default_start_time || "";
        } else if (sortField === "is_active") {
          aVal = a.is_active;
          bVal = b.is_active;
        }

        if (aVal < bVal) return sortAsc ? -1 : 1;
        if (aVal > bVal) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [drivers, search, columnSearch, statusFilter, baseFilter, sortField, sortAsc, baseById]);

  const activeCount = drivers.filter((driver) => driver.is_active).length;
  const canManageDrivers = source === "demo" || user?.role === "admin" || user?.role === "supervisor";

  function openCreate() {
    if (!canManageDrivers) return;
    setEditing(null);
    setForm({ ...EMPTY_FORM, base_id: bases[0]?.id || "" });
    setError(null);
    setIsFormOpen(true);
  }

  function openEdit(driver: Driver) {
    if (!canManageDrivers) return;
    setEditing(driver);
    setForm({
      name: driver.name,
      login_matricula: driver.login_matricula,
      base_id: driver.base_id,
      default_shift: driver.default_shift || "B",
      default_start_time: (driver.default_start_time || "12:00").slice(0, 5),
      is_active: driver.is_active,
    });
    setError(null);
    setIsFormOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canManageDrivers) {
      setError("Seu perfil pode consultar condutores, mas somente supervisores e administradores podem alterar cadastros.");
      return;
    }
    setError(null);
    setSuccess(null);
    const normalized = {
      ...form,
      name: form.name.trim().replace(/\s+/g, " "),
      login_matricula: form.login_matricula.trim(),
      default_start_time: `${form.default_start_time.slice(0, 5)}:00`,
    };

    if (!normalized.name || !normalized.login_matricula || !normalized.base_id) {
      setError("Preencha nome, matrícula e base de lotação.");
      return;
    }
    if (drivers.some((driver) => driver.login_matricula === normalized.login_matricula && driver.id !== editing?.id)) {
      setError("Esta matrícula já está cadastrada.");
      return;
    }

    setSaving(true);
    try {
      const saved = editing
        ? await updateDriver(editing.id, normalized, source)
        : await createDriver(normalized, source);
      setDrivers((current) =>
        editing ? current.map((driver) => (driver.id === saved.id ? saved : driver)) : [...current, saved]
      );
      setSuccess(editing ? "Cadastro atualizado com sucesso." : "Condutor cadastrado com sucesso.");
      setIsFormOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o cadastro.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(driver: Driver) {
    if (!canManageDrivers) {
      setError("Seu perfil pode consultar condutores, mas somente supervisores e administradores podem alterar cadastros.");
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const saved = await updateDriver(
        driver.id,
        {
          name: driver.name,
          login_matricula: driver.login_matricula,
          base_id: driver.base_id,
          default_shift: driver.default_shift || "B",
          default_start_time: driver.default_start_time || "12:00:00",
          is_active: !driver.is_active,
        },
        source
      );
      setDrivers((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setSuccess(saved.is_active ? "Condutor reativado." : "Condutor inativado sem apagar o histórico.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível alterar o status.");
    }
  }
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
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <h1 className="text-xs font-bold text-slate-900 leading-none">Cadastro e Gestão de Condutores</h1>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {activeCount} ativos de {drivers.length} cadastros totais
                  </p>
                </div>
              </div>

              {/* Busca de Condutor */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  aria-label="Buscar condutor"
                  placeholder="Buscar condutor ou matrícula..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-7 w-52 rounded border border-slate-400 bg-white pl-8 pr-7 text-xs font-semibold text-slate-900 placeholder-slate-500 focus:border-[#107c41] focus:outline-none"
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

              {/* Filtro de Status */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold text-slate-700">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="h-7 rounded border border-slate-400 bg-white px-2 text-xs font-medium text-slate-800 focus:border-[#107c41] focus:outline-none"
                >
                  <option value="active">Somente ativos</option>
                  <option value="inactive">Somente inativos</option>
                  <option value="all">Todos os status</option>
                </select>
              </div>

              {/* Filtro de Base */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold text-slate-700">Base:</span>
                <select
                  value={baseFilter}
                  onChange={(e) => setBaseFilter(e.target.value)}
                  className="h-7 rounded border border-slate-400 bg-white px-2 text-xs font-medium text-slate-800 focus:border-[#107c41] focus:outline-none"
                >
                  <option value="all">Todas as bases</option>
                  {bases.map((base) => (
                    <option key={base.id} value={base.id}>
                      {base.code} — {base.name}
                    </option>
                  ))}
                </select>
              </div>

              <span className="text-xs font-semibold text-slate-600 ml-1 font-mono">
                ({filtered.length} condutores)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={openCreate}
                disabled={!bases.length || !canManageDrivers}
                title={canManageDrivers ? "Cadastrar novo condutor" : "Somente supervisores e administradores podem cadastrar condutores"}
                className="flex h-7 items-center gap-1.5 rounded border border-[#0b5a30] bg-[#107c41] px-3 text-xs font-bold text-white hover:bg-[#0b5a30] disabled:opacity-50 transition-colors shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Novo Condutor</span>
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

          {!canManageDrivers && !loading && (
            <div className="flex items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Consulta habilitada. Alterações em condutores exigem perfil de supervisor ou administrador.</span>
            </div>
          )}

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
          {/* Tabela de Condutores Estilo Planilha Excel */}
          <div className="excel-catalog-grid flex-1 overflow-hidden flex flex-col border border-[#a6a6a6] bg-white shadow-sm relative">
            {loading ? (
              <div className="flex h-full items-center justify-center gap-2 text-xs font-semibold text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-[#107c41]" />
                Carregando cadastros de condutores...
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-175px)] relative select-none">
                <table className="border-collapse text-[11px] min-w-full font-sans table-fixed">
                  <colgroup>
                    <col style={{ width: "44px" }} />
                    <col style={{ width: "280px" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "100px" }} />
                    <col style={{ width: "90px" }} />
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "110px" }} />
                    <col style={{ width: "90px" }} />
                  </colgroup>

                  <thead className="sticky top-0 z-30">
                    <tr className="h-9">
                      <th className="excel-row-number sticky left-0 z-40 bg-[#107c41] text-white p-1 text-center font-bold text-xs border-r border-[#4e9d72]">
                        #
                      </th>

                      {/* Coluna NOME COMPLETO com Busca e Ordenação */}
                      <th className="sticky left-[44px] z-40 bg-[#107c41] text-white px-2.5 py-1 text-left font-bold text-xs border-r border-[#4e9d72]">
                        <div className="flex items-center justify-between gap-1">
                          {isSearchingHeader ? (
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
                                  setIsSearchingHeader(false);
                                }}
                                className="text-slate-500 hover:text-slate-900 ml-1"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div
                                onClick={() => handleSort("name")}
                                className="flex items-center space-x-1 cursor-pointer truncate flex-1 hover:text-emerald-100 transition-colors"
                              >
                                <span className="truncate font-bold tracking-wide">NOME COMPLETO</span>
                                <ArrowUpDown className="w-3 h-3 opacity-80 ml-0.5 shrink-0" />
                              </div>
                              <button
                                onClick={() => setIsSearchingHeader(true)}
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

                      <th
                        onClick={() => handleSort("login_matricula")}
                        className="bg-[#107c41] text-white px-2 py-1 text-center font-bold text-xs border-r border-[#4e9d72] cursor-pointer hover:bg-[#0b5a30] transition-colors"
                      >
                        <div className="flex items-center justify-center space-x-1">
                          <span>MATRÍCULA</span>
                          <ArrowUpDown className="w-3 h-3 opacity-80 shrink-0" />
                        </div>
                      </th>

                      <th
                        onClick={() => handleSort("base")}
                        className="bg-[#107c41] text-white px-2 py-1 text-center font-bold text-xs border-r border-[#4e9d72] cursor-pointer hover:bg-[#0b5a30] transition-colors"
                      >
                        <div className="flex items-center justify-center space-x-1">
                          <span>BASE</span>
                          <ArrowUpDown className="w-3 h-3 opacity-80 shrink-0" />
                        </div>
                      </th>

                      <th
                        onClick={() => handleSort("default_shift")}
                        className="bg-[#107c41] text-white px-2 py-1 text-center font-bold text-xs border-r border-[#4e9d72] cursor-pointer hover:bg-[#0b5a30] transition-colors"
                      >
                        <div className="flex items-center justify-center space-x-1">
                          <span>TURNO</span>
                          <ArrowUpDown className="w-3 h-3 opacity-80 shrink-0" />
                        </div>
                      </th>

                      <th
                        onClick={() => handleSort("default_start_time")}
                        className="bg-[#107c41] text-white px-2 py-1 text-center font-bold text-xs border-r border-[#4e9d72] cursor-pointer hover:bg-[#0b5a30] transition-colors"
                      >
                        <div className="flex items-center justify-center space-x-1">
                          <span>HORÁRIO</span>
                          <ArrowUpDown className="w-3 h-3 opacity-80 shrink-0" />
                        </div>
                      </th>

                      <th
                        onClick={() => handleSort("is_active")}
                        className="bg-[#107c41] text-white px-2 py-1 text-center font-bold text-xs border-r border-[#4e9d72] cursor-pointer hover:bg-[#0b5a30] transition-colors"
                      >
                        <div className="flex items-center justify-center space-x-1">
                          <span>STATUS</span>
                          <ArrowUpDown className="w-3 h-3 opacity-80 shrink-0" />
                        </div>
                      </th>

                      <th className="bg-[#107c41] text-white px-2 py-1 text-right font-bold text-xs">
                        <span>AÇÕES</span>
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#d9d9d9]">
                    {filtered.map((driver, row) => (
                      <tr
                        key={driver.id}
                        className={`h-8 group hover:bg-[#e2f0d9] ${!driver.is_active ? "opacity-60 bg-slate-50" : ""}`}
                      >
                        <td className="excel-row-number sticky left-0 z-20 bg-[#ededed] p-1 text-center text-slate-700 font-semibold border-r border-b border-slate-300 text-xs">
                          {row + 1}
                        </td>

                        {/* Nome do Condutor */}
                        <td
                          className="sticky left-[44px] z-20 bg-white group-hover:bg-[#e2f0d9] px-2.5 py-1 text-left border-r border-b border-slate-300 overflow-hidden font-medium"
                          title={driver.name}
                        >
                          <div className="flex items-center justify-between gap-1 overflow-hidden">
                            <span className="font-bold text-xs text-slate-900 truncate">
                              {driver.name}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(driver.name, `cond-${driver.id}`);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-emerald-700 transition-opacity ml-1 shrink-0 text-slate-400"
                              title="Copiar Nome"
                            >
                              {copiedCell === `cond-${driver.id}` ? (
                                <Check className="w-3 h-3 text-emerald-600 font-bold" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Matrícula */}
                        <td className="px-2 py-1 text-center font-mono font-bold text-xs text-slate-800 border-r border-b border-slate-300">
                          <div className="flex items-center justify-between px-1">
                            <span className="mx-auto font-bold">{driver.login_matricula}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(driver.login_matricula, `mat-${driver.id}`);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-emerald-700 transition-opacity shrink-0 text-slate-400"
                              title="Copiar Matrícula"
                            >
                              {copiedCell === `mat-${driver.id}` ? (
                                <Check className="w-3 h-3 text-emerald-600 font-bold" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Base */}
                        <td className="px-2 py-1 text-center border-r border-b border-slate-300">
                          <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 border border-slate-300 text-slate-800 font-bold font-mono">
                            {baseById.get(driver.base_id)?.code || "—"}
                          </span>
                        </td>

                        {/* Turno */}
                        <td className="px-2 py-1 text-center border-r border-b border-slate-300">
                          <span className={getShiftBadge(driver.default_shift)}>
                            {driver.default_shift || "—"}
                          </span>
                        </td>

                        {/* Horário (Nunca cortado, com cores fiéis) */}
                        <td className="px-2 py-1 text-center border-r border-b border-slate-300 whitespace-nowrap">
                          <span className={getHorarioBadge(driver.default_start_time, driver.default_shift)}>
                            {driver.default_start_time ? driver.default_start_time.slice(0, 5) : "—"}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-2 py-1 text-center border-r border-b border-slate-300">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] border font-bold inline-flex items-center gap-1 ${
                              driver.is_active
                                ? "bg-[#C6EFCE] text-[#006100] border-[#A9D08E]"
                                : "bg-[#FFC7CE] text-[#9C0006] border-[#F4B084]"
                            }`}
                          >
                            {driver.is_active ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                            {driver.is_active ? "ATIVO" : "INATIVO"}
                          </span>
                        </td>

                        {/* Ações */}
                        <td className="px-2 py-1 text-right border-b border-slate-300">
                          {canManageDrivers ? (
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => openEdit(driver)}
                                title="Editar condutor"
                                className="p-1 rounded text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => toggleStatus(driver)}
                                title={driver.is_active ? "Inativar condutor" : "Reativar condutor"}
                                className={`p-1 rounded hover:bg-slate-200 transition-colors ${
                                  driver.is_active ? "text-rose-600" : "text-emerald-700"
                                }`}
                              >
                                {driver.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400">Somente consulta</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!filtered.length && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-600 font-medium bg-white">
                          Nenhum condutor encontrado com os filtros atuais.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal de Cadastro / Edição */}
      {isFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          onMouseDown={(event) => event.target === event.currentTarget && setIsFormOpen(false)}
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-lg rounded-lg border border-slate-300 bg-white shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-[#f3f3f3] px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {editing ? "Editar Condutor" : "Novo Condutor"}
                </h3>
                <p className="text-[11px] text-slate-600">Dados usados na escala mensal e no acionamento diário</p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3.5 p-4 text-xs">
              <label className="col-span-2 space-y-1">
                <span className="font-bold text-slate-800">Nome Completo</span>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  maxLength={150}
                  className="w-full rounded border border-slate-400 bg-white px-3 py-1.5 text-xs text-slate-900 font-semibold focus:border-[#107c41] focus:outline-none"
                  placeholder="Ex: CARLOS ALBERTO SILVA"
                />
              </label>

              <label className="space-y-1">
                <span className="font-bold text-slate-800">Matrícula / Login</span>
                <input
                  value={form.login_matricula}
                  onChange={(event) => setForm({ ...form, login_matricula: event.target.value })}
                  maxLength={30}
                  className="w-full rounded border border-slate-400 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 font-bold focus:border-[#107c41] focus:outline-none"
                  placeholder="Ex: CARLOS.SILVA"
                />
              </label>

              <label className="space-y-1">
                <span className="font-bold text-slate-800">Base de Lotação</span>
                <select
                  value={form.base_id}
                  onChange={(event) => setForm({ ...form, base_id: event.target.value })}
                  className="w-full rounded border border-slate-400 bg-white px-3 py-1.5 text-xs text-slate-900 font-semibold focus:border-[#107c41] focus:outline-none"
                >
                  {bases
                    .filter((base) => base.is_active || base.id === form.base_id)
                    .map((base) => (
                      <option key={base.id} value={base.id}>
                        {base.code} — {base.name}
                      </option>
                    ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-bold text-slate-800">Letra da Escala</span>
                <select
                  value={form.default_shift}
                  onChange={(event) => {
                    const shift = event.target.value;
                    setForm({ ...form, default_shift: shift });
                  }}
                  className="w-full rounded border border-slate-400 bg-white px-3 py-1.5 text-xs text-slate-900 font-semibold focus:border-[#107c41] focus:outline-none"
                >
                  {SCALE_LETTERS.map((letter) => <option key={letter} value={letter}>{letter}</option>)}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-bold text-slate-800">Horário Padrão</span>
                <input
                  type="time"
                  value={form.default_start_time}
                  onChange={(event) => setForm({ ...form, default_start_time: event.target.value })}
                  className="w-full rounded border border-slate-400 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 font-bold focus:border-[#107c41] focus:outline-none"
                />
              </label>

              <label className="col-span-2 flex items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                  className="accent-[#107c41] h-4 w-4 rounded"
                />
                <span className="text-slate-800 font-medium">Condutor ativo e disponível para novas escalas</span>
              </label>

              {error && (
                <div className="col-span-2 flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-[#f3f3f3] px-4 py-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded border border-slate-400 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded bg-[#107c41] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#0b5a30] disabled:opacity-60 shadow-xs"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{editing ? "Salvar Alterações" : "Cadastrar Condutor"}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
