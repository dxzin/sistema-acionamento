"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { DispatchStatsBar } from "@/components/acionamento/DispatchStatsBar";
import { DispatchFilters } from "@/components/acionamento/DispatchFilters";
import { DispatchGrid } from "@/components/acionamento/DispatchGrid";
import { dispatchService } from "@/lib/services/dispatch-service";
import { createClient } from "@/lib/supabase/client";
import { DispatchRowModel, DispatchFilterOptions, DispatchSummaryKPIs } from "@/types/domain";
import { Location } from "@/types/database";

export default function AcionamentoPage() {
  const [dispatches, setDispatches] = useState<DispatchRowModel[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filtros
  const [filters, setFilters] = useState<DispatchFilterOptions>({
    searchQuery: "",
    statusFilter: "",
    baseFilter: "",
    shiftFilter: "",
    date: "2026-09-01",
    region: "SP",
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [dispatchesData, locs] = await Promise.all([
        dispatchService.getDispatchesForSheet(filters.date, filters.region),
        dispatchService.getLocations(),
      ]);

      setDispatches(dispatchesData);
      setLocations(locs);
    } catch (error) {
      console.error("Erro ao carregar dados da folha diária:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filters.date, filters.region]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sincronização em tempo real via Supabase Realtime
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || url.includes("placeholder")) return;

    const supabase = createClient();
    const channel = supabase
      .channel("dispatches_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispatches" },
        () => {
          // Recarregar dados com debounce leve
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Recalcular periodicamente as jornadas em andamento (tempo real a cada 10s)
  useEffect(() => {
    const interval = setInterval(() => {
      setDispatches((prev) =>
        prev.map((item) => {
          if (item.entry_time && !item.exit_time) {
            return {
              ...item,
            };
          }
          return item;
        })
      );
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleFilterChange = (newFilters: Partial<DispatchFilterOptions>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleUpdateRow = async (id: string, updates: Partial<DispatchRowModel>) => {
    // Atualização otimista imediata na UI
    setDispatches((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...updates } : row))
    );

    // Persistência no serviço
    await dispatchService.updateDispatch(id, updates);
  };

  // Filtragem dos registros
  const filteredDispatches = useMemo(() => {
    return dispatches.filter((item) => {
      // Busca por nome ou login
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        const nameMatch = item.driver.name.toLowerCase().includes(q);
        const loginMatch = item.driver.login_matricula.toLowerCase().includes(q);
        if (!nameMatch && !loginMatch) return false;
      }

      // Filtro por status
      if (filters.statusFilter && item.dispatch_status !== filters.statusFilter) {
        return false;
      }

      // Filtro por turno
      if (filters.shiftFilter && item.driver.default_shift !== filters.shiftFilter) {
        return false;
      }

      return true;
    });
  }, [dispatches, filters]);

  // Cálculo dos KPIs da barra de status
  const summaryKPIs: DispatchSummaryKPIs = useMemo(() => {
    const total = filteredDispatches.length;
    let acionados = 0;
    let abonados = 0;
    let apoios = 0;
    let trocas = 0;
    let faltas = 0;
    let emAndamento = 0;
    let pendentesAbono = 0;

    filteredDispatches.forEach((d) => {
      if (d.dispatch_status === "ACIONADO") acionados++;
      if (d.dispatch_status === "ABONADO") abonados++;
      if (d.dispatch_status === "APOIO") apoios++;
      if (d.dispatch_status === "TROCA") trocas++;
      if (d.dispatch_status === "FALTA") faltas++;
      if (d.is_ongoing) emAndamento++;
      if (d.abono_authorized_by === "PENDENTE" && d.dispatch_status === "ABONADO") pendentesAbono++;
    });

    return {
      total,
      acionados,
      abonados,
      apoios,
      trocas,
      faltas,
      emAndamento,
      pendentesAbono,
    };
  }, [filteredDispatches]);

  return (
    <div className="excel-shell flex-1 flex flex-col min-h-screen">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="excel-workspace flex-1 flex flex-col overflow-hidden">
          {/* Barra de Indicadores Operacionais */}
          <DispatchStatsBar summary={summaryKPIs} />

          {/* Filtros e Barra de Ações */}
          <DispatchFilters
            filters={filters}
            onFilterChange={handleFilterChange}
            onRefresh={loadData}
            isLoading={isLoading}
          />

          {/* Grade Operacional Estilo Planilha */}
          <DispatchGrid
            dispatches={filteredDispatches}
            onUpdateRow={handleUpdateRow}
            locations={locations}
          />
        </main>
      </div>
    </div>
  );
}
