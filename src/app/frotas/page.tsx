"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { createVehicle, loadVehicleCatalog, updateVehicle, VehicleCatalog, VehicleFormData } from "@/lib/services/vehicle-service";
import { Vehicle } from "@/types/database";
import { AlertCircle, CheckCircle2, Database, Edit3, Loader2, Plus, Search, Truck, X } from "lucide-react";

const EMPTY_FORM: VehicleFormData = { plate_code: "", vehicle_type: "CAVALO_MECANICO", is_active: true };
const VEHICLE_TYPES = [
  ["CAVALO_MECANICO", "Cavalo mecânico"],
  ["CARRETA", "Carreta"],
  ["BITREM", "Bitrem"],
  ["RODOTREM", "Rodotrem"],
  ["UTILITARIO", "Utilitário"],
] as const;

function typeLabel(value: string) {
  return VEHICLE_TYPES.find(([type]) => type === value)?.[1] || value.replaceAll("_", " ");
}

function normalizePlate(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
}

export default function FrotasPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [source, setSource] = useState<VehicleCatalog["source"]>("demo");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<VehicleFormData>(EMPTY_FORM);

  useEffect(() => {
    loadVehicleCatalog()
      .then((catalog) => { setVehicles(catalog.vehicles); setSource(catalog.source); })
      .catch((reason: Error) => setError(`Não foi possível carregar a frota: ${reason.message}`))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return vehicles.filter((vehicle) => {
      const matchesSearch = !query || vehicle.plate_code.toLowerCase().includes(query) || typeLabel(vehicle.vehicle_type).toLocaleLowerCase("pt-BR").includes(query);
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? vehicle.is_active : !vehicle.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [vehicles, search, statusFilter]);

  const activeCount = vehicles.filter((vehicle) => vehicle.is_active).length;

  function openCreate() {
    setEditing(null); setForm(EMPTY_FORM); setError(null); setIsFormOpen(true);
  }

  function openEdit(vehicle: Vehicle) {
    setEditing(vehicle);
    setForm({ plate_code: vehicle.plate_code, vehicle_type: vehicle.vehicle_type, is_active: vehicle.is_active });
    setError(null); setIsFormOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); setError(null); setSuccess(null);
    const normalized = { ...form, plate_code: normalizePlate(form.plate_code) };
    if (normalized.plate_code.length < 3) { setError("Informe uma placa ou identificação com pelo menos 3 caracteres."); return; }
    if (vehicles.some((vehicle) => vehicle.plate_code.toUpperCase() === normalized.plate_code && vehicle.id !== editing?.id)) { setError("Esta placa já está cadastrada."); return; }

    setSaving(true);
    try {
      const saved = editing ? await updateVehicle(editing.id, normalized, source) : await createVehicle(normalized, source);
      setVehicles((current) => editing ? current.map((vehicle) => vehicle.id === saved.id ? saved : vehicle) : [...current, saved]);
      setSuccess(editing ? "Veículo atualizado." : "Veículo cadastrado."); setIsFormOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o veículo.");
    } finally { setSaving(false); }
  }

  async function toggleStatus(vehicle: Vehicle) {
    setError(null); setSuccess(null);
    try {
      const saved = await updateVehicle(vehicle.id, { plate_code: vehicle.plate_code, vehicle_type: vehicle.vehicle_type, is_active: !vehicle.is_active }, source);
      setVehicles((current) => current.map((item) => item.id === saved.id ? saved : item));
      setSuccess(saved.is_active ? "Veículo reativado." : "Veículo inativado sem apagar o histórico.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível alterar o status."); }
  }

  return (
    <div className="excel-shell flex min-h-screen flex-1 flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="excel-workspace flex flex-1 flex-col overflow-hidden">
          <section className="excel-catalog-toolbar flex flex-wrap items-center gap-2 p-2">
            <div className="mr-auto flex items-center gap-2">
              <Truck className="h-4 w-4" />
              <div><h1 className="text-sm font-semibold">Cadastro de frotas</h1><p className="text-[11px] text-neutral-600">{activeCount} ativos de {vehicles.length} veículos</p></div>
            </div>
            <span className="excel-source hidden items-center gap-1 px-2 py-1 text-[10px] font-semibold sm:inline-flex"><Database className="h-3 w-3" />{source === "supabase" ? "Supabase" : "Demonstração"}</span>
            <div className="relative"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" /><input type="search" aria-label="Buscar frota" placeholder="Buscar placa ou tipo" value={search} onChange={(event) => setSearch(event.target.value)} className="h-8 w-48 pl-7 pr-2 text-xs" /></div>
            <select aria-label="Filtrar por status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-8 px-2 text-xs"><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option></select>
            <button onClick={openCreate} className="flex h-8 items-center gap-1.5 px-3 text-xs font-semibold"><Plus className="h-3.5 w-3.5" />Novo veículo</button>
          </section>

          {(error || success) && <div className={`excel-notice flex items-center gap-2 px-3 py-2 text-xs ${error ? "is-error" : "is-success"}`}>{error ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}<span>{error || success}</span><button className="ml-auto" onClick={() => { setError(null); setSuccess(null); }} aria-label="Fechar aviso"><X className="h-3.5 w-3.5" /></button></div>}

          <section className="excel-catalog-grid flex-1 overflow-auto">
            {loading ? <div className="flex h-full items-center justify-center gap-2 text-xs text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" />Carregando frota...</div> : <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead className="sticky top-0 z-10"><tr className="excel-column-letters"><th>#</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr><tr><th>Linha</th><th>Placa / frota</th><th>Tipo do veículo</th><th>Status operacional</th><th>Cadastro</th><th>Ações</th></tr></thead>
              <tbody>{filtered.map((vehicle, index) => <tr key={vehicle.id} className={!vehicle.is_active ? "is-inactive" : ""}>
                <td className="excel-row-number">{index + 1}</td><td className="font-mono font-semibold tracking-wider">{vehicle.plate_code}</td><td>{typeLabel(vehicle.vehicle_type)}</td><td><span className={`excel-status ${vehicle.is_active ? "is-active" : "is-inactive"}`}>{vehicle.is_active ? "ATIVO" : "INATIVO"}</span></td><td>{new Intl.DateTimeFormat("pt-BR").format(new Date(vehicle.created_at))}</td><td><div className="flex justify-center gap-1"><button onClick={() => openEdit(vehicle)} title="Editar veículo" aria-label={`Editar ${vehicle.plate_code}`}><Edit3 className="h-3.5 w-3.5" /></button><button onClick={() => toggleStatus(vehicle)} className="min-w-16 px-2 text-[10px]" title={vehicle.is_active ? "Inativar veículo" : "Reativar veículo"}>{vehicle.is_active ? "Inativar" : "Reativar"}</button></div></td>
              </tr>)}{!filtered.length && <tr><td colSpan={6} className="py-12 text-center text-neutral-500">Nenhum veículo encontrado com os filtros atuais.</td></tr>}</tbody>
            </table>}
          </section>
        </main>
      </div>

      {isFormOpen && <div className="excel-modal fixed inset-0 z-50 flex items-center justify-center p-4" onMouseDown={(event) => event.target === event.currentTarget && setIsFormOpen(false)}>
        <form onSubmit={handleSubmit} className="w-full max-w-md bg-white shadow-2xl">
          <div className="excel-modal-title flex items-center justify-between px-4 py-2"><div><h2 className="text-sm font-semibold">{editing ? "Editar veículo" : "Novo veículo"}</h2><p className="text-[11px]">Dados usados na grade de acionamento</p></div><button type="button" onClick={() => setIsFormOpen(false)} aria-label="Fechar"><X className="h-4 w-4" /></button></div>
          <div className="grid gap-3 p-4 text-xs">
            <label className="space-y-1"><span className="font-semibold">Placa / identificação</span><input autoFocus value={form.plate_code} onChange={(event) => setForm({ ...form, plate_code: normalizePlate(event.target.value) })} placeholder="5300 ou ABC1D23" className="w-full px-3 py-2 font-mono uppercase tracking-wider" /></label>
            <label className="space-y-1"><span className="font-semibold">Tipo do veículo</span><select value={form.vehicle_type} onChange={(event) => setForm({ ...form, vehicle_type: event.target.value })} className="w-full px-3 py-2">{VEHICLE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="flex items-center gap-2 border border-neutral-300 bg-neutral-50 px-3 py-2"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /><span>Disponível para novos acionamentos</span></label>
            {error && <div className="flex items-center gap-2 text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}
          </div>
          <div className="flex justify-end gap-2 border-t border-neutral-300 bg-neutral-100 px-4 py-3"><button type="button" onClick={() => setIsFormOpen(false)} className="border border-neutral-400 bg-white px-3 py-1.5">Cancelar</button><button type="submit" disabled={saving} className="flex items-center gap-1.5 bg-[var(--excel-green)] px-4 py-1.5 font-semibold text-white disabled:opacity-60">{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{editing ? "Salvar alterações" : "Cadastrar veículo"}</button></div>
        </form>
      </div>}
    </div>
  );
}
