"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { createDriver, DriverCatalog, DriverFormData, loadDriverCatalog, updateDriver } from "@/lib/services/driver-service";
import { Base, Driver } from "@/types/database";
import { AlertCircle, CheckCircle2, Database, Edit3, Loader2, Plus, Search, UserCheck, UserX, Users, X } from "lucide-react";

const EMPTY_FORM: DriverFormData = { name: "", login_matricula: "", base_id: "", default_shift: "B", default_start_time: "12:00", is_active: true };
const SHIFT_TIMES: Record<string, string> = { A: "04:00", B: "12:00", C: "20:00" };

function getShiftBadge(shift?: string | null, timeStr?: string | null) {
  const s = (shift || "").toUpperCase();
  const t = (timeStr || "").trim();

  if (s === "A" || t.startsWith("04:")) {
    return "bg-amber-400/20 text-amber-300 border border-amber-500/40 font-bold px-2 py-0.5 rounded text-[11px]";
  }
  if (s === "B" || t.startsWith("12:")) {
    return "bg-sky-400/20 text-sky-300 border border-sky-500/40 font-bold px-2 py-0.5 rounded text-[11px]";
  }
  if (s === "C" || t.startsWith("20:")) {
    return "bg-purple-400/20 text-purple-300 border border-purple-500/40 font-bold px-2 py-0.5 rounded text-[11px]";
  }
  return "bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded text-[11px]";
}

export default function CondutoresPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [bases, setBases] = useState<Base[]>([]);
  const [source, setSource] = useState<DriverCatalog["source"]>("demo");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<DriverFormData>(EMPTY_FORM);

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

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return drivers.filter((driver) => {
      const matchesSearch = !query || driver.name.toLocaleLowerCase("pt-BR").includes(query) || driver.login_matricula.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? driver.is_active : !driver.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [drivers, search, statusFilter]);

  const baseById = useMemo(() => new Map(bases.map((base) => [base.id, base])), [bases]);
  const activeCount = drivers.filter((driver) => driver.is_active).length;

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, base_id: bases[0]?.id || "" });
    setError(null);
    setIsFormOpen(true);
  }

  function openEdit(driver: Driver) {
    setEditing(driver);
    setForm({ name: driver.name, login_matricula: driver.login_matricula, base_id: driver.base_id, default_shift: driver.default_shift || "B", default_start_time: (driver.default_start_time || "12:00").slice(0, 5), is_active: driver.is_active });
    setError(null);
    setIsFormOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const normalized = { ...form, name: form.name.trim().replace(/\s+/g, " "), login_matricula: form.login_matricula.trim(), default_start_time: `${form.default_start_time.slice(0, 5)}:00` };

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
      const saved = editing ? await updateDriver(editing.id, normalized, source) : await createDriver(normalized, source);
      setDrivers((current) => editing ? current.map((driver) => driver.id === saved.id ? saved : driver) : [...current, saved]);
      setSuccess(editing ? "Cadastro atualizado com sucesso." : "Condutor cadastrado com sucesso.");
      setIsFormOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o cadastro.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(driver: Driver) {
    setError(null);
    setSuccess(null);
    try {
      const saved = await updateDriver(driver.id, { name: driver.name, login_matricula: driver.login_matricula, base_id: driver.base_id, default_shift: driver.default_shift || "B", default_start_time: driver.default_start_time || "12:00:00", is_active: !driver.is_active }, source);
      setDrivers((current) => current.map((item) => item.id === saved.id ? saved : item));
      setSuccess(saved.is_active ? "Condutor reativado." : "Condutor inativado sem apagar o histórico.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível alterar o status.");
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-950">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col p-3 overflow-hidden">
          <div className="bg-slate-900 border border-slate-800 rounded p-3 mb-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2"><Users className="w-4 h-4 text-emerald-400" /> Cadastro e Gestão de Condutores</h2>
                <p className="text-xs text-slate-400">{activeCount} ativos de {drivers.length} cadastros</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`hidden lg:inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold uppercase ${source === "supabase" ? "border-emerald-800 bg-emerald-950 text-emerald-300" : "border-amber-800 bg-amber-950 text-amber-300"}`}><Database className="w-3 h-3" /> {source === "supabase" ? "Supabase" : "Modo demonstração"}</span>
                <button onClick={openCreate} disabled={!bases.length} className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"><Plus className="w-3.5 h-3.5" /> Novo condutor</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative min-w-64 flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  placeholder="Buscar condutor ou matrícula..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full pl-8 pr-8 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"><option value="active">Somente ativos</option><option value="inactive">Somente inativos</option><option value="all">Todos os status</option></select>
              <span className="text-xs text-slate-400 ml-auto font-mono">
                {filtered.length} condutores encontrados
              </span>
            </div>
          </div>

          {(error || success) && <div className={`mb-3 flex items-center gap-2 rounded border px-3 py-2 text-xs ${error ? "border-rose-800 bg-rose-950/60 text-rose-300" : "border-emerald-800 bg-emerald-950/60 text-emerald-300"}`}>{error ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}<span>{error || success}</span><button className="ml-auto" onClick={() => { setError(null); setSuccess(null); }} aria-label="Fechar aviso"><X className="w-3.5 h-3.5" /></button></div>}

          <div className="border border-slate-800 rounded bg-slate-900 overflow-auto flex-1 shadow-md">
            {loading ? <div className="h-full flex items-center justify-center gap-2 text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Carregando cadastros...</div> : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-800 text-slate-300 font-bold sticky top-0 border-b border-slate-700"><tr><th className="px-3 py-2">NOME COMPLETO</th><th className="px-3 py-2 text-center">MATRÍCULA</th><th className="px-3 py-2 text-center">BASE</th><th className="px-3 py-2 text-center">TURNO</th><th className="px-3 py-2 text-center">HORÁRIO</th><th className="px-3 py-2 text-center">STATUS</th><th className="px-3 py-2 text-right">AÇÕES</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {filtered.map((driver) => (
                    <tr key={driver.id} className={`hover:bg-slate-800/60 h-10 ${!driver.is_active ? "opacity-60" : ""}`}>
                      <td className="px-3 py-1.5 font-medium text-slate-100">{driver.name}</td>
                      <td className="px-3 py-1.5 text-center font-mono font-bold text-slate-400">{driver.login_matricula}</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 border border-slate-700 text-slate-300 font-bold">
                          {baseById.get(driver.base_id)?.code || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={getShiftBadge(driver.default_shift, driver.default_start_time)}>
                          {driver.default_shift || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={getShiftBadge(driver.default_shift, driver.default_start_time)}>
                          {driver.default_start_time ? driver.default_start_time.slice(0, 5) : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] border font-bold inline-flex items-center gap-1 ${driver.is_active ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
                          {driver.is_active ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                          {driver.is_active ? "ATIVO" : "INATIVO"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(driver)} title="Editar condutor" className="p-1.5 rounded text-slate-400 hover:bg-slate-700 hover:text-white">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => toggleStatus(driver)} title={driver.is_active ? "Inativar condutor" : "Reativar condutor"} className={`p-1.5 rounded hover:bg-slate-700 ${driver.is_active ? "text-rose-400" : "text-emerald-400"}`}>
                            {driver.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && <tr><td colSpan={7} className="py-12 text-center text-slate-500">Nenhum condutor encontrado com os filtros atuais.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {isFormOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" onMouseDown={(event) => event.target === event.currentTarget && setIsFormOpen(false)}>
        <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><div><h3 className="text-sm font-bold text-white">{editing ? "Editar condutor" : "Novo condutor"}</h3><p className="text-[11px] text-slate-400">Dados usados na escala e no acionamento diário</p></div><button type="button" onClick={() => setIsFormOpen(false)} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button></div>
          <div className="grid grid-cols-2 gap-3 p-4 text-xs">
            <label className="col-span-2 space-y-1"><span className="font-semibold text-slate-300">Nome completo</span><input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={150} className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100" /></label>
            <label className="space-y-1"><span className="font-semibold text-slate-300">Matrícula / login</span><input value={form.login_matricula} onChange={(event) => setForm({ ...form, login_matricula: event.target.value })} maxLength={30} className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-slate-100" /></label>
            <label className="space-y-1"><span className="font-semibold text-slate-300">Base de lotação</span><select value={form.base_id} onChange={(event) => setForm({ ...form, base_id: event.target.value })} className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100">{bases.filter((base) => base.is_active || base.id === form.base_id).map((base) => <option key={base.id} value={base.id}>{base.code} — {base.name}</option>)}</select></label>
            <label className="space-y-1"><span className="font-semibold text-slate-300">Turno padrão</span><select value={form.default_shift} onChange={(event) => { const shift = event.target.value; setForm({ ...form, default_shift: shift, default_start_time: SHIFT_TIMES[shift] }); }} className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"><option value="A">A — manhã (04:00)</option><option value="B">B — tarde (12:00)</option><option value="C">C — noite (20:00)</option></select></label>
            <label className="space-y-1"><span className="font-semibold text-slate-300">Horário padrão</span><input type="time" value={form.default_start_time} onChange={(event) => setForm({ ...form, default_start_time: event.target.value })} className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-slate-100" /></label>
            <label className="col-span-2 flex items-center gap-2 rounded border border-slate-700 bg-slate-800 px-3 py-2"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} className="accent-emerald-500" /><span className="text-slate-300">Condutor ativo e disponível para novas escalas</span></label>
            {error && <div className="col-span-2 flex items-center gap-2 text-rose-300"><AlertCircle className="w-4 h-4" />{error}</div>}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-800 px-4 py-3"><button type="button" onClick={() => setIsFormOpen(false)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancelar</button><button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-60">{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{editing ? "Salvar alterações" : "Cadastrar condutor"}</button></div>
        </form>
      </div>}
    </div>
  );
}
