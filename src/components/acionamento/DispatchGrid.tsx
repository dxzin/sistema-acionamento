"use client";

import React, { useState } from "react";
import { DispatchRowModel } from "@/types/domain";
import { DispatchStatus, CargoStatus } from "@/types/database";
import { ArrowUpDown, Check, Copy, Clock } from "lucide-react";

interface DispatchGridProps {
  dispatches: DispatchRowModel[];
  onUpdateRow: (id: string, updates: Partial<DispatchRowModel>) => Promise<void>;
  locations: { id: string; name: string }[];
  vehicles: { id: string; plate_code: string }[];
}

type SortField = keyof DispatchRowModel | "driver_name" | "login";

export function DispatchGrid({
  dispatches,
  onUpdateRow,
  locations,
  vehicles,
}: DispatchGridProps) {
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("forecast_start_time");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

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

  const sortedDispatches = [...dispatches].sort((a, b) => {
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

  // Função para aplicar badges de cores conforme o status operacional
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

  return (
    <div className="border border-slate-700 rounded-b bg-slate-900 overflow-hidden shadow-md flex flex-col flex-1">
      {/* Contêiner com rolagem horizontal e vertical */}
      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-210px)] relative select-none">
        <table className="w-full text-left border-collapse table-fixed text-[11px]">
          {/* Cabeçalho Fixo */}
          <thead className="bg-slate-800 text-slate-200 uppercase font-bold sticky top-0 z-20 shadow-sm border-b border-slate-700">
            <tr className="h-8">
              {/* Coluna 1: CONDUTOR (Fixada à esquerda) */}
              <th
                onClick={() => handleSort("driver_name")}
                className="w-[190px] px-2.5 py-1.5 border-r border-slate-700 sticky left-0 bg-slate-800 z-30 cursor-pointer hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">CONDUTOR</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60 ml-1 shrink-0" />
                </div>
              </th>

              {/* Coluna 2: LOGIN (Fixada à esquerda) */}
              <th
                onClick={() => handleSort("login")}
                className="w-[85px] px-2 py-1.5 border-r border-slate-700 sticky left-[190px] bg-slate-800 z-30 cursor-pointer hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span>LOGIN</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60 ml-1 shrink-0" />
                </div>
              </th>

              {/* Coluna 3: HORÁRIO */}
              <th className="w-[75px] px-2 py-1.5 border-r border-slate-700 text-center">
                HORÁRIO
              </th>

              {/* Coluna 4: PREVISÃO */}
              <th
                onClick={() => handleSort("forecast_start_time")}
                className="w-[85px] px-2 py-1.5 border-r border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors text-center"
              >
                <div className="flex items-center justify-center space-x-1">
                  <span>PREVISÃO</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60 shrink-0" />
                </div>
              </th>

              {/* Coluna 5: ACIONADO / STATUS */}
              <th
                onClick={() => handleSort("dispatch_status")}
                className="w-[125px] px-2 py-1.5 border-r border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors text-center"
              >
                <div className="flex items-center justify-center space-x-1">
                  <span>STATUS</span>
                  <ArrowUpDown className="w-3 h-3 opacity-60 shrink-0" />
                </div>
              </th>

              {/* Coluna 6: MOTIVO DO ABONO */}
              <th className="w-[200px] px-2 py-1.5 border-r border-slate-700">
                MOTIVO DO ABONO / APROVAÇÃO
              </th>

              {/* Coluna 7: LOCAL */}
              <th className="w-[95px] px-2 py-1.5 border-r border-slate-700 text-center">
                LOCAL
              </th>

              {/* Coluna 8: ENTRADA */}
              <th className="w-[80px] px-2 py-1.5 border-r border-slate-700 text-center">
                ENTRADA
              </th>

              {/* Coluna 9: FROTA */}
              <th className="w-[95px] px-2 py-1.5 border-r border-slate-700 text-center">
                FROTA
              </th>

              {/* Coluna 10: C/V */}
              <th className="w-[50px] px-1.5 py-1.5 border-r border-slate-700 text-center">
                C/V
              </th>

              {/* Coluna 11: DESTINO */}
              <th className="w-[110px] px-2 py-1.5 border-r border-slate-700">
                DESTINO
              </th>

              {/* Coluna 12: DESTINO FINAL */}
              <th className="w-[110px] px-2 py-1.5 border-r border-slate-700">
                DESTINO FINAL
              </th>

              {/* Coluna 13: SAÍDA */}
              <th className="w-[80px] px-2 py-1.5 border-r border-slate-700 text-center">
                SAÍDA
              </th>

              {/* Coluna 14: OBSERVAÇÃO */}
              <th className="w-[170px] px-2 py-1.5 border-r border-slate-700">
                OBSERVAÇÃO
              </th>

              {/* Coluna 15: DIA DE ESCALA */}
              <th className="w-[80px] px-2 py-1.5 border-r border-slate-700 text-center">
                DIA ESC.
              </th>

              {/* Coluna 16: PREV. PRÓX. */}
              <th className="w-[85px] px-2 py-1.5 border-r border-slate-700 text-center text-emerald-400">
                PREV. PRÓX.
              </th>

              {/* Coluna 17: TEMPO DE JORNADA */}
              <th className="w-[95px] px-2 py-1.5 text-center text-amber-300">
                TEMPO JORNADA
              </th>
            </tr>
          </thead>

          {/* Corpo da Tabela com Linhas Compactas e Edição Rápida */}
          <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
            {sortedDispatches.map((row, index) => {
              const isEven = index % 2 === 0;
              const hasAbonoPending = row.abono_authorized_by === "PENDENTE" && row.dispatch_status === "ABONADO";

              return (
                <tr
                  key={row.id}
                  className={`h-7 transition-colors hover:bg-slate-800/80 ${
                    hasAbonoPending
                      ? "bg-amber-950/30 border-l-2 border-l-amber-500"
                      : isEven
                      ? "bg-slate-900"
                      : "bg-slate-900/60"
                  }`}
                >
                  {/* 1. CONDUTOR (Fixado) */}
                  <td className="px-2.5 py-0.5 border-r border-slate-800 sticky left-0 bg-slate-900 z-10 font-sans font-medium text-slate-100 truncate group">
                    <div className="flex items-center justify-between">
                      <span className="truncate" title={row.driver.name}>
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
                  <td className="px-2 py-0.5 border-r border-slate-800 sticky left-[190px] bg-slate-900 z-10 text-slate-400 font-bold text-center group">
                    <div className="flex items-center justify-between">
                      <span className="mx-auto">{row.driver.login_matricula}</span>
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

                  {/* 3. HORÁRIO */}
                  <td className="px-1.5 py-0.5 border-r border-slate-800 text-center text-slate-300">
                    {row.driver.default_start_time || "--:--"}
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
                      placeholder="--:--"
                      onChange={(e) => onUpdateRow(row.id, { entry_time: e.target.value })}
                      className="w-full bg-transparent text-center text-emerald-300 placeholder-slate-600 focus:bg-slate-800 focus:outline-none rounded font-bold px-1"
                    />
                  </td>

                  {/* 9. FROTA */}
                  <td className="px-1 py-0.5 border-r border-slate-800 text-center">
                    <select
                      value={row.vehicle_id || ""}
                      onChange={(e) => onUpdateRow(row.id, { vehicle_id: e.target.value || null })}
                      className="w-full bg-transparent text-center text-slate-200 font-bold focus:bg-slate-800 focus:outline-none rounded cursor-pointer"
                    >
                      <option value="" className="bg-slate-900 text-slate-400">
                        - Frota -
                      </option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id} className="bg-slate-900 text-slate-200">
                          {v.plate_code}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* 10. C/V */}
                  <td className="px-0.5 py-0.5 border-r border-slate-800 text-center">
                    <select
                      value={row.cargo_status || ""}
                      onChange={(e) => onUpdateRow(row.id, { cargo_status: (e.target.value as CargoStatus) || null })}
                      className={`w-full bg-transparent text-center font-bold focus:bg-slate-800 focus:outline-none rounded cursor-pointer ${
                        row.cargo_status === "C" ? "text-amber-400" : row.cargo_status === "V" ? "text-cyan-400" : "text-slate-500"
                      }`}
                    >
                      <option value="" className="bg-slate-900 text-slate-400">
                        -
                      </option>
                      <option value="C" className="bg-slate-900 text-amber-400">
                        C
                      </option>
                      <option value="V" className="bg-slate-900 text-cyan-400">
                        V
                      </option>
                    </select>
                  </td>

                  {/* 11. DESTINO */}
                  <td className="px-1 py-0.5 border-r border-slate-800">
                    <select
                      value={row.destination_location_id || ""}
                      onChange={(e) => onUpdateRow(row.id, { destination_location_id: e.target.value || null })}
                      className="w-full bg-transparent text-slate-200 focus:bg-slate-800 focus:outline-none rounded cursor-pointer truncate font-sans text-[11px]"
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
                      onChange={(e) => onUpdateRow(row.id, { final_destination_location_id: e.target.value || null })}
                      className="w-full bg-transparent text-slate-200 focus:bg-slate-800 focus:outline-none rounded cursor-pointer truncate font-sans text-[11px]"
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
                      placeholder="--:--"
                      onChange={(e) => onUpdateRow(row.id, { exit_time: e.target.value })}
                      className="w-full bg-transparent text-center text-cyan-300 placeholder-slate-600 focus:bg-slate-800 focus:outline-none rounded font-bold px-1"
                    />
                  </td>

                  {/* 14. OBSERVAÇÃO */}
                  <td className="px-1.5 py-0.5 border-r border-slate-800">
                    <input
                      type="text"
                      value={row.observations || ""}
                      placeholder="Anotações..."
                      onChange={(e) => onUpdateRow(row.id, { observations: e.target.value })}
                      className="w-full bg-transparent text-slate-300 placeholder-slate-600 focus:bg-slate-800 focus:outline-none rounded px-1 font-sans text-[11px] truncate"
                    />
                  </td>

                  {/* 15. DIA DE ESCALA */}
                  <td className="px-1.5 py-0.5 border-r border-slate-800 text-center font-bold">
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] ${
                        row.scale_day_status === "F"
                          ? "bg-rose-900/80 text-white"
                          : row.scale_day_status === "FE"
                          ? "bg-blue-900 text-blue-200"
                          : "text-slate-300"
                      }`}
                    >
                      {row.scale_day_status || "-"}
                    </span>
                  </td>

                  {/* 16. PREV. PRÓX. */}
                  <td className="px-1.5 py-0.5 border-r border-slate-800 text-center text-emerald-400 font-bold">
                    {row.next_day_forecast_time || "--:--"}
                  </td>

                  {/* 17. TEMPO DE JORNADA */}
                  <td className="px-1.5 py-0.5 text-center font-bold">
                    {row.formatted_worked_time ? (
                      <div className="flex items-center justify-center space-x-1">
                        {row.is_ongoing && (
                          <Clock className="w-3 h-3 text-cyan-400 animate-pulse inline" />
                        )}
                        <span
                          className={`${
                            row.is_ongoing
                              ? "text-cyan-400"
                              : row.total_worked_minutes && row.total_worked_minutes > 600
                              ? "text-rose-400"
                              : "text-amber-300"
                          }`}
                        >
                          {row.formatted_worked_time}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-600">--:--</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {sortedDispatches.length === 0 && (
              <tr>
                <td colSpan={17} className="text-center py-8 text-slate-500 font-sans">
                  Nenhum condutor encontrado com os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Rodapé da Grade com Atalhos Operacionais */}
      <div className="bg-slate-800 border-t border-slate-700 px-3 py-1.5 text-[10px] text-slate-400 flex items-center justify-between select-none">
        <div className="flex items-center space-x-4">
          <span>
            Total Exibido: <strong className="text-slate-200">{sortedDispatches.length}</strong> linhas
          </span>
          <span>
            Dica: Utilize <kbd className="px-1 bg-slate-900 rounded border border-slate-700 text-slate-300">Tab</kbd> para navegar rapidamente entre os campos.
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Salvo Automaticamente</span>
          </span>
        </div>
      </div>
    </div>
  );
}
