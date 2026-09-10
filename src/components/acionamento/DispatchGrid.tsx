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

  // Cores de horário fiéis à planilha Excel
  const getHorarioBadge = (timeStr?: string | null, shift?: string | null) => {
    const t = (timeStr || "").trim();
    const s = (shift || "").toUpperCase();

    if (t.startsWith("04:") || s === "A") {
      return "bg-[#FFF2CC] text-[#7F4B00] border border-[#FDE68A] font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs";
    }
    if (t.startsWith("12:") || s === "B") {
      return "bg-[#DDEBF7] text-[#0369A1] border border-[#BAE6FD] font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs";
    }
    if (t.startsWith("20:") || s === "C") {
      return "bg-[#EDE7F6] text-[#5B2C6F] border border-[#DDD6FE] font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap shadow-xs";
    }
    return "bg-slate-100 text-slate-700 border border-slate-300 font-bold px-2 py-0.5 rounded text-[11px] whitespace-nowrap";
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
      case "TROCA":
        return "bg-[#FFFFCC] text-[#7F6000] border-[#FFE699]";
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
        <table className="text-left border-collapse table-fixed text-[11px] min-w-full">
          {/* Definição estrita das larguras de colunas */}
          <colgroup>
            <col style={{ width: "44px" }} />
            <col style={{ width: "230px" }} />
            <col style={{ width: "86px" }} />
            <col style={{ width: "92px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "135px" }} />
            <col style={{ width: "230px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "55px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "180px" }} />
            <col style={{ width: "80px" }} />
            <col style={{ width: "95px" }} />
            <col style={{ width: "110px" }} />
          </colgroup>

          {/* Cabeçalho Fixo */}
          <thead className="sticky top-0 z-30">
            <tr className="excel-column-letters h-5" aria-hidden="true">
              <th className="sticky left-0 z-40 text-center">#</th>
              <th className="sticky left-[44px] z-30 text-center">A</th>
              <th className="sticky left-[274px] z-30 text-center">B</th>
              {"CDEFGHIJKLMNOPQ".split("").map((letter) => (
                <th key={letter} className="text-center">{letter}</th>
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
              <th className="px-2 py-1.5 border-r border-emerald-700 text-center font-bold">
                HORÁRIO
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
          </thead>

          {/* Corpo da Tabela */}
          <tbody className="text-[11px]">
            {processedDispatches.map((row, index) => {
              const hasAbonoPending =
                row.abono_authorized_by === "PENDENTE" && row.dispatch_status === "ABONADO";

              return (
                <tr
                  key={row.id}
                  onClick={() => setSelectedRow(row.id)}
                  className={`h-8 ${selectedRow === row.id ? "excel-selected-row" : ""} ${
                    hasAbonoPending ? "bg-amber-50" : ""
                  }`}
                >
                  <td className="excel-row-number sticky left-0 z-20 text-center">
                    {index + 1}
                  </td>

                  {/* 1. CONDUTOR (Fixado - Texto Escuro e Nítido) */}
                  <td className="sticky left-[44px] z-20 px-2.5 py-1 font-sans font-semibold group overflow-hidden border-r border-slate-300">
                    <div className="flex items-center justify-between gap-1 overflow-hidden">
                      <span className="truncate text-slate-900 font-bold text-xs" title={row.driver.name}>
                        {row.driver.name}
                      </span>
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
                  <td className="px-1 py-1 text-center whitespace-nowrap">
                    <span className={getHorarioBadge(row.driver.default_start_time, row.driver.default_shift)}>
                      {row.driver.default_start_time ? row.driver.default_start_time.slice(0, 5) : "--:--"}
                    </span>
                  </td>

                  {/* 4. PREVISÃO */}
                  <td className="px-1 py-1 text-center">
                    <input
                      type="text"
                      value={row.forecast_start_time || ""}
                      placeholder="INSERIR"
                      onChange={(e) => onUpdateRow(row.id, { forecast_start_time: e.target.value })}
                      className="w-full text-center text-slate-900 font-mono font-medium placeholder-slate-400 focus:bg-white focus:outline-none rounded px-1"
                    />
                  </td>

                  {/* 5. ACIONADO / STATUS */}
                  <td className="px-1 py-1 text-center">
                    <select
                      value={row.dispatch_status}
                      onChange={(e) => onUpdateRow(row.id, { dispatch_status: e.target.value as DispatchStatus })}
                      className={`w-full py-0.5 px-1 rounded text-[10px] font-extrabold border cursor-pointer focus:outline-none shadow-xs ${getStatusBadge(
                        row.dispatch_status
                      )}`}
                    >
                      {STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st} className="bg-white text-slate-900 font-medium">
                          {st}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* 6. MOTIVO DO ABONO / APROVAÇÃO */}
                  <td className="px-1.5 py-1">
                    <div className="flex items-center space-x-1">
                      <input
                        type="text"
                        value={row.abono_reason || ""}
                        placeholder="Motivo da ocorrência..."
                        onChange={(e) => onUpdateRow(row.id, { abono_reason: e.target.value })}
                        className="flex-1 text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none rounded px-1 text-[11px] truncate font-sans"
                      />
                      {row.dispatch_status === "ABONADO" || row.abono_reason ? (
                        <select
                          value={row.abono_authorized_by || "PENDENTE"}
                          onChange={(e) => onUpdateRow(row.id, { abono_authorized_by: e.target.value })}
                          className={`text-[9px] px-1 py-0.5 rounded border font-bold ${
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
                  <td className="px-1 py-1 text-center">
                    <select
                      value={row.origin_location_id || ""}
                      onChange={(e) => onUpdateRow(row.id, { origin_location_id: e.target.value || null })}
                      className="w-full text-center text-slate-900 font-semibold focus:bg-white focus:outline-none rounded cursor-pointer"
                    >
                      <option value="" className="text-slate-400">
                        - Local -
                      </option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id} className="text-slate-900">
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* 8. ENTRADA */}
                  <td className="px-1 py-1 text-center">
                    <input
                      type="text"
                      value={row.entry_time || ""}
                      placeholder="--:--:--"
                      onChange={(e) => onUpdateRow(row.id, { entry_time: e.target.value || null })}
                      className="w-full text-center text-slate-900 font-mono font-medium placeholder-slate-400 focus:bg-white focus:outline-none rounded px-1"
                    />
                  </td>

                  {/* 9. FROTA (Digitação Livre) */}
                  <td className="px-1 py-1 text-center">
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
                      className="w-full text-center text-slate-900 font-mono font-bold uppercase placeholder-slate-400 focus:bg-white focus:outline-none rounded px-1"
                    />
                  </td>

                  {/* 10. C/V */}
                  <td className="px-0.5 py-1 text-center">
                    <select
                      value={row.cargo_status || ""}
                      onChange={(e) =>
                        onUpdateRow(row.id, { cargo_status: (e.target.value || null) as CargoStatus | null })
                      }
                      className="w-full text-center font-extrabold text-slate-900 focus:bg-white focus:outline-none rounded cursor-pointer"
                    >
                      <option value="" className="text-slate-400 font-normal">
                        -
                      </option>
                      <option value="C" className="text-emerald-700 font-bold">
                        C
                      </option>
                      <option value="V" className="text-amber-700 font-bold">
                        V
                      </option>
                    </select>
                  </td>

                  {/* 11. DESTINO */}
                  <td className="px-1 py-1">
                    <select
                      value={row.destination_location_id || ""}
                      onChange={(e) => onUpdateRow(row.id, { destination_location_id: e.target.value || null })}
                      className="w-full text-slate-900 font-medium focus:bg-white focus:outline-none rounded cursor-pointer truncate"
                    >
                      <option value="" className="text-slate-400">
                        - Destino -
                      </option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id} className="text-slate-900">
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* 12. DESTINO FINAL */}
                  <td className="px-1 py-1">
                    <select
                      value={row.final_destination_location_id || ""}
                      onChange={(e) =>
                        onUpdateRow(row.id, { final_destination_location_id: e.target.value || null })
                      }
                      className="w-full text-slate-900 font-medium focus:bg-white focus:outline-none rounded cursor-pointer truncate"
                    >
                      <option value="" className="text-slate-400">
                        - Destino Final -
                      </option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id} className="text-slate-900">
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* 13. SAÍDA */}
                  <td className="px-1 py-1 text-center">
                    <input
                      type="text"
                      value={row.exit_time || ""}
                      placeholder="--:--:--"
                      onChange={(e) => onUpdateRow(row.id, { exit_time: e.target.value || null })}
                      className="w-full text-center text-slate-900 font-mono font-medium placeholder-slate-400 focus:bg-white focus:outline-none rounded px-1"
                    />
                  </td>

                  {/* 14. OBSERVAÇÃO */}
                  <td className="px-1.5 py-1">
                    <input
                      type="text"
                      value={row.observations || ""}
                      placeholder="Notas..."
                      onChange={(e) => onUpdateRow(row.id, { observations: e.target.value })}
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
    </div>
  );
}
