"use client";

import React, { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { INITIAL_DRIVERS } from "@/lib/mock-data";
import { Calendar, Download, Search } from "lucide-react";

export default function EscalaPage() {
  const [month, setMonth] = useState(6);
  const [year, setYear] = useState(2026);
  const [region, setRegion] = useState("SP");
  const [search, setSearch] = useState("");

  const days = Array.from({ length: 30 }, (_, i) => i + 1);

  const filteredDrivers = INITIAL_DRIVERS.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.login_matricula.includes(search)
  );

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-950">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col p-3 overflow-hidden">
          {/* Cabeçalho do Módulo */}
          <div className="bg-slate-900 border border-slate-800 rounded p-3 mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>Gestão de Escala Mensal</span>
              </h2>
              <p className="text-xs text-slate-400">
                Grade de programação de folgas e ciclos de trabalho (6x2 / 4x2)
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value={5}>Maio / 2026</option>
                <option value={6}>Junho / 2026</option>
                <option value={7}>Julho / 2026</option>
                <option value={8}>Agosto / 2026</option>
                <option value={9}>Setembro / 2026</option>
              </select>

              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value="SP">Escala SP (Lençóis Paulista)</option>
                <option value="MG">Escala MG (Uberaba / LZ / JP)</option>
                <option value="MS">Escala MS</option>
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filtrar condutor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200"
                />
              </div>
            </div>
          </div>

          {/* Grade da Escala Mensal */}
          <div className="border border-slate-800 rounded bg-slate-900 overflow-x-auto flex-1 shadow-md">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead className="bg-slate-800 text-slate-300 font-bold sticky top-0 border-b border-slate-700">
                <tr>
                  <th className="px-3 py-2 border-r border-slate-700 w-[220px] sticky left-0 bg-slate-800 z-10">
                    NOME DO CONDUTOR
                  </th>
                  <th className="px-2 py-2 border-r border-slate-700 text-center w-[70px]">
                    LOGIN
                  </th>
                  <th className="px-2 py-2 border-r border-slate-700 text-center w-[60px]">
                    TURNO
                  </th>
                  {days.map((d) => (
                    <th key={d} className="px-1 py-2 border-r border-slate-700 text-center w-[36px]">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {filteredDrivers.map((driver, idx) => {
                  return (
                    <tr key={driver.id} className="hover:bg-slate-800/60 h-7">
                      <td className="px-3 py-1 border-r border-slate-800 sticky left-0 bg-slate-900 z-10 font-sans font-medium text-slate-200 truncate">
                        {driver.name}
                      </td>
                      <td className="px-2 py-1 border-r border-slate-800 text-center text-slate-400 font-bold">
                        {driver.login_matricula}
                      </td>
                      <td className="px-2 py-1 border-r border-slate-800 text-center text-emerald-400 font-bold">
                        {driver.default_shift || "B"}
                      </td>
                      {days.map((day) => {
                        // Padrão simulado de ciclo 6x2
                        const cycleDay = ((day + idx) % 8) + 1;
                        const isFolga = cycleDay >= 7;
                        const label = isFolga ? "F" : String(cycleDay);

                        return (
                          <td
                            key={day}
                            className={`px-1 py-1 border-r border-slate-800 text-center font-bold text-[10px] ${
                              isFolga ? "bg-rose-950/60 text-rose-300" : "text-slate-300"
                            }`}
                          >
                            {label}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
