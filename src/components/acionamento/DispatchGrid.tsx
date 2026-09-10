"use client";

import React, { useState, useMemo } from "react";
import { DispatchRowModel } from "@/types/domain";
import { DispatchStatus, CargoStatus } from "@/types/database";
import { ArrowUpDown, Check, Copy, Clock, Search, X } from "lucide-react";

interface DispatchGridProps {
  dispatches: DispatchRowModel[];
  onUpdateRow: (id: string, updates: Partial<DispatchRowModel>) => Promise<void>;
  locations: { id: string; name: string }[];
}

type SortField = keyof DispatchRowModel | "driver_name" | "login";

export function DispatchGrid({
  dispatches,
  onUpdateRow,
  locations,
}: DispatchGridProps) {
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("forecast_start_time");
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [fleetDrafts, setFleetDrafts] = useState<Record<string, string>>({});
  const [columnSearch, setColumnSearch] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Status de acionamento disponíveis
  const STATUS_OPTIONS: DispatchStatus[] = [
    "ACIONADO",
    "ABONADO",
    "APOIO",
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

  // Cores de horário conforme a planilha (Turno A 04h, Turno B 12h, Turno C 20h)
  const getHorarioBadge = (timeStr?: string | null, shift?: string | null) => {
    const t = (timeStr || "").trim();
    const s = (shift || "").toUpperCase();

    if (t.startsWith("04:") || s === "A") {
      return "bg-amber-400/20 text-amber-300 border border-amber-500/40 font-bold px-1.5 py-0.5 rounded text-[10px]";
    }
    if (t.startsWith("12:") || s === "B") {
      return "bg-sky-400/20 text-sky-300 border border-sky-500/40 font-bold px-1.5 py-0.5 rounded text-[10px]";
    }
    if (t.startsWith("20:") || s === "C") {
      return "bg-purple-400/20 text-purple-300 border border-purple-500/40 font-bold px-1.5 py-0.5 rounded text-[10px]";
    }
    return "text-slate-300 font-mono text-[10px]";
  };

  // Badges de status operacional conforme a planilha
  const getStatusBadge = (status: DispatchStatus) => {
    switch (status) {
      case "ACIONADO":
        return "bg-emerald-950 text-emerald-300 border-emerald-700";
      case "ABONADO":
        return "bg-rose-950 text-rose-300 border-rose-700";
      case "APOIO":
        return "bg-amber-950 text-amber-300 border-amber-700";
      case "TROCA":
        return "bg-yellow-950 text-yellow-300 border-yellow-700";
      case "FALTA":
        return "bg-red-900 text-white font-bold border-red-700";
      case "ATESTADO":
        return "bg-blue-950 text-blue-300 border-blue-700";
      case "AFASTADO":
        return "bg-pink-950 text-pink-300 border-pink-700";
      case "BATE E VOLTA":
        return "bg-orange-950 text-orange-300 border-orange-700";
      case "SUSPENSÃO":
        return "bg-purple-950 text-purple-300 border-purple-700";
      case "VIAGEM FECHADA":
        return "bg-indigo-950 text-indigo-300 border-indigo-700";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

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

    return result.sort((a, b) => {
      let aVal: string | number | boolean | null = "";
      let bVal: string | number | boolean | null = "";

      if (sortField === "driver_name") {
        aVal = a.driver.name;
        bVal = b.driver.name;
      } else if (sortField === "login") {
        aVal = a.driver.login_matricula;
        bVal = b.driver.login_matricula;
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
  }, [dispatches, columnSearch, sortField, sortAsc]);

  return (
    <div className="excel-grid overflow-hidden flex flex-col flex-1">
      {/* Contêiner com rolagem horizontal e vertical */}
      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-210px)] relative select-none">
        <table className="w-full text-left border-collapse table-fixed text-[11px]">
          {/* Cabeçalho Fixo */}
          <thead className="sticky top-0 z-20 bg-slate-800">
            <tr className="excel-column-letters h-5" aria-hidden="true">
              <th className="w-[42px] sticky left-0 z-40 bg-slate-800">#</th>
              {"ABCDEFGHIJKLMNOPQ".split("").map((letter) => (
                <th key={letter} className="bg-slate-800">{letter}</th>
              ))}
            </tr>
            <tr className="h-9">
              <th className="excel-row-number w-[42px] sticky left-0 z-40 bg-slate-800 text-center">#</th>
              
              {/* Coluna 1: CONDUTOR (Fixada à esquerda com Pesquisa Integrada) */}
              <th className="w-[220px] px-2 py-1 sticky left-[42px] z-30 bg-slate-800 border-r border-slate-700">
                <div className="flex items-center justify-between gap-1">
                  {isSearching ? (
                    <div className="flex items-center flex-1 bg-slate-900 border border-emerald-500 rounded px-1.5 py-0.5">
                      <Search className="w-3 h-3 text-emerald-400 shrink-0 mr-1" />
                      <input
                        autoFocus
                        type="text"
                        placeholder="Filtrar condutor..."
                        value={columnSearch}
                        onChange={(e) => setColumnSearch(e.target.value)}
                        className="bg-transparent text-slate-100 text-xs w-full focus:outline-none font-sans"
                      />
                      <button
                        onClick={() => {
                          setColumnSearch("");
                          setIsSearching(false);
                        }}
                        className="text-slate-400 hover:text-white ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        onClick={() => handleSort("driver_name")}
                        className="flex items-center space-x-1 cursor-pointer truncate flex-1 hover:text-emerald-400 transition-colors"
                      >
                        <span className="truncate font-bold">CONDUTOR</span>
                        <ArrowUpDown className="w-3 h-3 opacity-60 ml-0.5 shrink-0" />
                      </div>
                      <button
                        onClick={() => setIsSearching(true)}
                        className={`p-1 rounded hover:bg-slate-700 transition-colors ${
                          columnSearch ? "text-emerald-400 bg-slate-900" : "text-slate-400"
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
                className="w-[85px] px-2 py-1.5 sticky left-[262px] z-30 bg-slate-800 border-r border-slate-700 cursor-pointer text-center"
              >
                <div className="flex items-center justify-center space-x-1">
                  <span className="font-bold">LOGIN</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60 shrink-0" />
                </div>
              </th>

              {/* Coluna 3: HORÁRIO (Com destaque de turno) */}
              <th className="w-[85px] px-2 py-1.5 border-r border-slate-700 text-center font-bold">
                HORÁRIO
              </th>

              {/* Coluna 4: PREVISÃO */}
              <th
                onClick={() => handleSort("forecast_start_time")}
                className="w-[85px] px-2 py-1.5 border-r border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors text-center"
              >
                <div className="flex items-center justify-center space-x-1">
                  <span className="font-bold">PREVISÃO</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60 shrink-0" />
                </div>
              </th>

              {/* Coluna 5: ACIONADO / STATUS */}
              <th
                onClick={() => handleSort("dispatch_status")}
                className="w-[125px] px-2 py-1.5 border-r border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors text-center"
              >
                <div className="flex items-center justify-center space-x-1">
                  <span className="font-bold">STATUS</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60 shrink-0" />
                </div>
              </th>

              {/* Coluna 6: MOTIVO DO ABONO */}
              <th className="w-[200px] px-2 py-1.5 border-r border-slate-700 font-bold">
                MOTIVO DO ABONO / APROVAÇÃO
              </th>

              {/* Coluna 7: LOCAL */}
              <th className="w-[95px] px-2 py-1.5 border-r border-slate-700 text-center font-bold">
                LOCAL
              </th>

              {/* Coluna 8: ENTRADA */}
              <th className="w-[80px] px-2 py-1.5 border-r border-slate-700 text-center font-bold">
                ENTRADA
              </th>

              {/* Coluna 9: FROTA */}
              <th className="w-[95px] px-2 py-1.5 border-r border-slate-700 text-center font-bold">
                FROTA
              </th>

              {/* Coluna 10: C/V */}
              <th className="w-[50px] px-1.5 py-1.5 border-r border-slate-700 text-center font-bold">
                C/V
              </th>

              {/* Coluna 11: DESTINO */}
              <th className="w-[110px] px-2 py-1.5 border-r border-slate-700 font-bold">
                DESTINO
              </th>

              {/* Coluna 12: DESTINO FINAL */}
              <th className="w-[110px] px-2 py-1.5 border-r border-slate-700 font-bold">
                DESTINO FINAL
              </th>

              {/* Coluna 13: SAÍDA */}
              <th className="w-[80px] px-2 py-1.5 border-r border-slate-700 text-center font-bold">
                SAÍDA
              </th>

              {/* Coluna 14: OBSERVAÇÃO */}
              <th className="w-[170px] px-2 py-1.5 border-r border-slate-700 font-bold">
                OBSERVAÇÃO
              </th>

              {/* Coluna 15: DIA DE ESCALA */}
              <th className="w-[80px] px-2 py-1.5 border-r border-slate-700 text-center font-bold">
                DIA ESC.
              </th>

              {/* Coluna 16: PREV. PRÓX. */}
              <th className="w-[85px] px-2 py-1.5 border-r border-slate-700 text-center text-emerald-400 font-bold">
                PREV. PRÓX.
              </th>

              {/* Coluna 17: TEMPO DE JORNADA */}
              <th className="w-[95px] px-2 py-1.5 text-center text-amber-300 font-bold">
                TEMPO JORNADA
              </th>
            </tr>
          </thead>

          {/* Corpo da Tabela */}
          <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
            {processedDispatches.map((row, index) => {
              const isEven = index % 2 === 0;
              const hasAbonoPending =
                row.abono_authorized_by === "PENDENTE" && row.dispatch_status === "ABONADO";

              return (
                <tr
                  key={row.id}
                  onClick={() => setSelectedRow(row.id)}
                  className={`h-7 ${selectedRow === row.id ? "excel-selected-row" : ""} ${
                    hasAbonoPending
                      ? "bg-amber-950/30 border-l-2 border-l-amber-500"
                      : isEven
                      ? "bg-slate-900"
                      : "bg-slate-900/60"
                  }`}
                >
                  <td className="excel-row-number w-[42px] sticky left-0 z-20 text-center bg-slate-900 text-slate-500">
                    {index + 1}
                  </td>

                  {/* 1. CONDUTOR (Fixado) */}
                  <td className="px-2.5 py-0.5 sticky left-[42px] z-10 bg-slate-900 font-sans font-medium truncate group border-r border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-slate-200" title={row.driver.name}>
                        {row.driver.name}
                      </span>
                      <button
                        onClick={() => handleCopy(row.driver.name, `cond-${row.id}`)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-emerald-400 transition-opacity ml-1 shrink-0"
                        title="Copiar Nome"
                      >
                        {copiedCell === `cond-${row.id}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-500" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* 2. LOGIN (Fixado) */}
                  <td className="px-2 py-0.5 sticky left-[262px] z-10 bg-slate-900 font-bold text-center group border-r border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="mx-auto text-slate-300">{row.driver.login_matricula}</span>
                      <button
                        onClick={() => handleCopy(row.driver.login_matricula, `login-${row.id}`)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-emerald-400 transition-opacity shrink-0"
                        title="Copiar Login"
                      >
                        {copiedCell === `login-${row.id}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-500" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* 3. HORÁRIO (Com cores de turno 04h, 12h, 20h) */}
                  <td className="px-1.5 py-0.5 border-r border-slate-800 text-center">
                    <span className={getHorarioBadge(row.driver.default_start_time, row.driver.default_shift)}>
                      {row.driver.default_start_time ? row.driver.default_start_time.slice(0, 5) : "--:--"}
                    </span>
                  </td>

                  {/* 4. PREVISÃO */}
                  <td className="px-1 py-0.5 border-r border-slate-800 text-center">
                    <input
                      type="text"
                      value={row.forecast_start_time || ""}
                      placeholder="INSERIR"
                      onChange={(e) => onUpdateRow(row.id, { forecast_start_time: e.target.value })}
                      className="w-full bg-transparent text-center text-slate-200 placeholder-slate-600 focus:bg-slate-800 focus:outline-none rounded px-1"
                    />
                  </td>

                  {/* 5. ACIONADO / STATUS */}
                  <td className="px-1 py-0.5 border-r border-slate-800 text-center">
                    <select
                      value={row.dispatch_status}
                      onChange={(e) => onUpdateRow(row.id, { dispatch_status: e.target.value as DispatchStatus })}
                      className={`w-full py-0.5 px-1 rounded text-[10px] font-bold border cursor-pointer focus:outline-none ${getStatusBadge(
                        row.dispatch_status
                      )}`}
                    >
                      {STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st} className="bg-slate-900 text-slate-200">
                          {st}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* 6. MOTIVO DO ABONO / APROVAÇÃO */}
                  <td className="px-1.5 py-0.5 border-r border-slate-800">
                    <div className="flex items-center space-x-1">
                      <input
                        type="text"
                        value={row.abono_reason || ""}
                        placeholder="Motivo da ocorrência..."
                        onChange={(e) => onUpdateRow(row.id, { abono_reason: e.target.value })}
                        className="flex-1 bg-transparent text-slate-200 placeholder-slate-600 focus:bg-slate-800 focus:outline-none rounded px-1 text-[11px] truncate font-sans"
                      />
                      {row.dispatch_status === "ABONADO" || row.abono_reason ? (
                        <select
                          value={row.abono_authorized_by || "PENDENTE"}
                          onChange={(e) => onUpdateRow(row.id, { abono_authorized_by: e.target.value })}
                          className={`text-[9px] px-1 py-0.5 rounded border ${
                            row.abono_authorized_by === "PENDENTE"
                              ? "bg-amber-950 text-amber-300 border-amber-500 font-bold"
                              : "bg-slate-800 text-slate-300 border-slate-700"
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
                  <td className="px-1 py-0.5 border-r border-slate-800 text-center">
                    <select
                      value={row.origin_location_id || ""}
                      onChange={(e) => onUpdateRow(row.id, { origin_location_id: e.target.value || null })}
                      className="w-full bg-transparent text-center text-slate-200 focus:bg-slate-800 focus:outline-none rounded cursor-pointer"
                    >
                      <option value="" className="bg-slate-900 text-slate-400">
                        - Local -
                      </option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id} className="bg-slate-900 text-slate-200">
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* 8. ENTRADA */}
                  <td className="px-1 py-0.5 border-r border-slate-800 text-center">
                    <input
                      type="text"
                      value={row.entry_time || ""}
                      placeholder="--:--:--"
                      onChange={(e) => onUpdateRow(row.id, { entry_time: e.target.value || null })}
                      className="w-full bg-transparent text-center text-slate-200 placeholder-slate-600 focus:bg-slate-800 focus:outline-none rounded px-1"
                    />
                  </td>

                  {/* 9. FROTA (Digitação Livre) */}
                  <td className="px-1 py-0.5 border-r border-slate-800 text-center">
                    <input
                      type="text"
                      value={fleetDrafts[row.id] ?? (row.fleet_code || row.vehicle?.plate_code || "")}
                      placeholder="Ex: ABC1234"
                      onChange={(e) =>
                        setFleetDrafts((prev) => ({
                          ...prev,
                          [row.id]: e.target.value.toUpperCase(),
                        }))
                      }
                      onBlur={(e) => {
                        const value = e.target.value.trim().toUpperCase();
                        setFleetDrafts((prev) => {
                          const copy = { ...prev };
                          delete copy[row.id];
                          return copy;
                        });
                        onUpdateRow(row.id, { fleet_code: value });
                      }}
                      className="w-full bg-transparent text-center text-slate-200 placeholder-slate-600 focus:bg-slate-800 focus:outline-none rounded px-1 font-mono uppercase"
                    />
                  </td>

                  {/* 10. C/V */}
                  <td className="px-0.5 py-0.5 border-r border-slate-800 text-center">
                    <select
                      value={row.cargo_status || ""}
                      onChange={(e) =>
                        onUpdateRow(row.id, { cargo_status: (e.target.value || null) as CargoStatus | null })
                      }
                      className="w-full bg-transparent text-center font-bold text-slate-200 focus:bg-slate-800 focus:outline-none rounded cursor-pointer"
                    >
                      <option value="" className="bg-slate-900 text-slate-400">
                        -
                      </option>
                      <option value="C" className="bg-slate-900 text-emerald-400 font-bold">
                        C
                      </option>
                      <option value="V" className="bg-slate-900 text-amber-400 font-bold">
                        V
                      </option>
                    </select>
                  </td>

                  {/* 11. DESTINO */}
                  <td className="px-1 py-0.5 border-r border-slate-800">
                    <select
                      value={row.destination_location_id || ""}
                      onChange={(e) => onUpdateRow(row.id, { destination_location_id: e.target.value || null })}
                      className="w-full bg-transparent text-slate-200 focus:bg-slate-800 focus:outline-none rounded cursor-pointer truncate"
                    >
                      <option value="" className="bg-slate-900 text-slate-400">
                        - Destino -
                      </option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id} className="bg-slate-900 text-slate-200">
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* 12. DESTINO FINAL */}
                  <td className="px-1 py-0.5 border-r border-slate-800">
                    <select
                      value={row.final_destination_location_id || ""}
                      onChange={(e) =>
                        onUpdateRow(row.id, { final_destination_location_id: e.target.value || null })
                      }
                      className="w-full bg-transparent text-slate-200 focus:bg-slate-800 focus:outline-none rounded cursor-pointer truncate"
                    >
                      <option value="" className="bg-slate-900 text-slate-400">
                        - Destino Final -
                      </option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id} className="bg-slate-900 text-slate-200">
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* 13. SAÍDA */}
                  <td className="px-1 py-0.5 border-r border-slate-800 text-center">
                    <input
                      type="text"
                      value={row.exit_time || ""}
                      placeholder="--:--:--"
                      onChange={(e) => onUpdateRow(row.id, { exit_time: e.target.value || null })}
                      className="w-full bg-transparent text-center text-slate-200 placeholder-slate-600 focus:bg-slate-800 focus:outline-none rounded px-1"
                    />
                  </td>

                  {/* 14. OBSERVAÇÃO */}
                  <td className="px-1.5 py-0.5 border-r border-slate-800">
                    <input
                      type="text"
                      value={row.observations || ""}
                      placeholder="Notas..."
                      onChange={(e) => onUpdateRow(row.id, { observations: e.target.value })}
                      className="w-full bg-transparent text-slate-200 placeholder-slate-600 focus:bg-slate-800 focus:outline-none rounded px-1 text-[11px] truncate font-sans"
                    />
                  </td>

                  {/* 15. DIA DE ESCALA */}
                  <td className="px-1 py-0.5 border-r border-slate-800 text-center font-bold text-slate-300">
                    {row.scale_day_status || "-"}
                  </td>

                  {/* 16. PREV. PRÓX. DIA */}
                  <td className="px-1 py-0.5 border-r border-slate-800 text-center font-semibold text-emerald-400">
                    {row.next_day_forecast_time ? row.next_day_forecast_time.slice(0, 5) : "--:--"}
                  </td>

                  {/* 17. TEMPO DE JORNADA */}
                  <td className="px-1.5 py-0.5 text-center font-bold">
                    {row.is_ongoing ? (
                      <span className="flex items-center justify-center space-x-1 text-emerald-400 animate-pulse">
                        <Clock className="w-3 h-3 inline mr-0.5" />
                        <span>{row.formatted_worked_time}</span>
                      </span>
                    ) : row.formatted_worked_time ? (
                      <span
                        className={
                          (row.total_worked_minutes || 0) > 600
                            ? "text-rose-400 font-extrabold"
                            : "text-slate-200"
                        }
                      >
                        {row.formatted_worked_time}
                      </span>
                    ) : (
                      <span className="text-slate-600">--:--</span>
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
    </div>
  );
}
