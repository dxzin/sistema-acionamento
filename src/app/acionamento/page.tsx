"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { DispatchStatsBar } from "@/components/acionamento/DispatchStatsBar";
import { DispatchFilters } from "@/components/acionamento/DispatchFilters";
import { DispatchGrid } from "@/components/acionamento/DispatchGrid";
import { dispatchService } from "@/lib/services/dispatch-service";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DispatchRowModel, DispatchFilterOptions, DispatchSummaryKPIs } from "@/types/domain";
import { DailySheet, Location, OperatorPresence } from "@/types/database";
import { currentDateInBrasilia } from "@/lib/dates/operational-date";

export default function AcionamentoPage() {
  const { user } = useAuth();
  const [dispatches, setDispatches] = useState<DispatchRowModel[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [dailySheet, setDailySheet] = useState<DailySheet | null>(null);
  const [changingSheetStatus, setChangingSheetStatus] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<{ status: "idle" | "saving" | "saved" | "error"; message?: string }>({ status: "idle" });
  const [onlineOperators, setOnlineOperators] = useState<OperatorPresence[]>([]);
  const [activeDispatchId, setActiveDispatchId] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const syncTokenRef = useRef<string | null>(null);
  const pendingWritesRef = useRef(0);

  // Filtros
  const [filters, setFilters] = useState<DispatchFilterOptions>({
    searchQuery: "",
    statusFilter: "",
    baseFilter: "",
    shiftFilter: "",
    date: currentDateInBrasilia(),
    region: "SP",
  });

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const dispatchesData = await dispatchService.getDispatchesForSheet(filters.date, filters.region);
      const [locs, sheet, syncToken] = await Promise.all([
        dispatchService.getLocations(),
        dispatchService.getDailySheet(filters.date, filters.region),
        dispatchService.getDailySheetSyncToken(filters.date, filters.region),
      ]);

      // Uma resposta de uma data/região antiga nunca pode sobrescrever a
      // consulta mais recente quando o operador navega rapidamente.
      if (requestId === loadRequestRef.current) {
        setDispatches(dispatchesData);
        setLocations(locs);
        setDailySheet(sheet);
        syncTokenRef.current = syncToken;
      }
    } catch (error) {
      console.error("Erro ao carregar dados da folha diária:", error);
      if (requestId === loadRequestRef.current) {
        setDispatches([]);
        setDailySheet(null);
        setLoadError(error instanceof Error ? error.message : "Não foi possível carregar a folha diária.");
      }
    } finally {
      if (requestId === loadRequestRef.current) setIsLoading(false);
    }
  }, [filters.date, filters.region]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => setActiveDispatchId(null), [filters.date, filters.region]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let running = false;
    const heartbeat = async () => {
      if (running) return;
      running = true;
      try {
        await dispatchService.touchOperatorPresence(
          filters.date, filters.region, activeDispatchId, user.name, user.email
        );
        const presence = await dispatchService.getOperatorPresence(filters.date, filters.region);
        if (active) setOnlineOperators(presence);
      } catch (error) {
        console.warn("Presença dos operadores temporariamente indisponível:", error);
      } finally {
        running = false;
      }
    };
    void heartbeat();
    const interval = window.setInterval(heartbeat, 4000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [activeDispatchId, filters.date, filters.region, user]);

  useEffect(() => {
    const userId = user?.id;
    return () => {
      if (userId) void dispatchService.clearOperatorPresence(userId);
    };
  }, [user?.id]);

  const syncFromRemote = useCallback(() => {
    const activeElement = document.activeElement;
    const operatorIsTyping = activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLSelectElement || activeElement instanceof HTMLTextAreaElement;
    if (pendingWritesRef.current > 0 || operatorIsTyping) return;
    void loadData();
  }, [loadData]);

  // Sincronização em tempo real via Supabase Realtime
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || url.includes("placeholder")) return;

    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("dispatches_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispatches" },
        () => {
          // Uma colagem pode atualizar dezenas de linhas. Agrupar os eventos
          // evita recargas concorrentes e preserva a atualização otimista.
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(syncFromRemote, 700);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "daily_sheets" },
        syncFromRemote
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [syncFromRemote]);

  // Algumas redes corporativas bloqueiam WebSocket. Este verificador leve
  // consulta somente a versão mais recente e recarrega a grade se algo mudou.
  useEffect(() => {
    let checking = false;
    const checkForChanges = async () => {
      if (checking || document.visibilityState !== "visible" || pendingWritesRef.current > 0) return;
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLSelectElement || activeElement instanceof HTMLTextAreaElement) return;
      checking = true;
      try {
        const token = await dispatchService.getDailySheetSyncToken(filters.date, filters.region);
        if (syncTokenRef.current !== null && token !== syncTokenRef.current) {
          syncTokenRef.current = token;
          await loadData();
        } else {
          syncTokenRef.current = token;
        }
      } catch (error) {
        console.warn("Sincronização automática temporariamente indisponível:", error);
      } finally {
        checking = false;
      }
    };
    const interval = window.setInterval(checkForChanges, 2500);
    return () => window.clearInterval(interval);
  }, [filters.date, filters.region, loadData]);

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
    const originalRow = dispatches.find((row) => row.id === id);
    if (dailySheet?.status !== "OPEN") {
      throw new Error("Esta folha está fechada e disponível somente para consulta.");
    }
    pendingWritesRef.current += 1;
    setSaveState({ status: "saving" });

    // Atualização otimista imediata na UI
    setDispatches((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...updates } : row))
    );

    try {
      const saved = await dispatchService.updateDispatch(id, updates, originalRow?.updated_at);
      if (!saved) throw new Error("O banco não confirmou a alteração.");

      setDispatches((prev) =>
        prev.map((row) => (row.id === id ? { ...row, ...saved, ...updates } : row))
      );

      const typedNames = [
        { name: updates.destination_name, id: saved.destination_location_id },
        { name: updates.final_destination_name, id: saved.final_destination_location_id },
      ].filter((item): item is { name: string; id: string } => Boolean(item.name && item.id));

      if (typedNames.length) {
        setLocations((current) => {
          const next = [...current];
          for (const item of typedNames) {
            if (!next.some((location) => location.name.toUpperCase() === item.name.toUpperCase())) {
              next.push({ id: item.id, name: item.name, is_active: true, created_at: new Date().toISOString() });
            }
          }
          return next.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        });
      }

      setSaveState({ status: "saved" });
    } catch (error) {
      if (originalRow) {
        setDispatches((prev) => prev.map((row) => (row.id === id ? originalRow : row)));
      }
      const saveError = error instanceof Error ? error : new Error("Erro ao salvar alteração");
      setSaveState({
        status: "error",
        message: saveError.message,
      });
      if (saveError.message.startsWith("Conflito:") || saveError.message.includes("folha está fechada")) {
        await loadData();
      }
      throw saveError;
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
  };

  const handleToggleSheetStatus = async () => {
    if (!dailySheet || changingSheetStatus) return;
    const closing = dailySheet.status === "OPEN";
    const confirmed = window.confirm(closing
      ? `Fechar a folha de ${filters.date}? Ela ficará bloqueada para edição.`
      : `Reabrir a folha de ${filters.date} para edição?`);
    if (!confirmed) return;

    setChangingSheetStatus(true);
    setSaveState({ status: "saving" });
    try {
      const updated = await dispatchService.setDailySheetStatus(dailySheet.id, closing ? "CLOSED" : "OPEN");
      setDailySheet(updated);
      setSaveState({ status: "saved" });
    } catch (error) {
      setSaveState({
        status: "error",
        message: error instanceof Error ? error.message : "Não foi possível alterar o estado da folha.",
      });
    } finally {
      setChangingSheetStatus(false);
    }
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
      if (["BALDEIO", "TROCA"].includes(d.dispatch_status)) trocas++;
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

  const activeEditors = useMemo(() => {
    const editors: Record<string, string[]> = {};
    for (const presence of onlineOperators) {
      if (!presence.active_dispatch_id || presence.user_id === user?.id) continue;
      editors[presence.active_dispatch_id] = [
        ...(editors[presence.active_dispatch_id] || []),
        presence.display_name || presence.email,
      ];
    }
    return editors;
  }, [onlineOperators, user?.id]);

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
            sheetStatus={dailySheet?.status || null}
            onToggleSheetStatus={handleToggleSheetStatus}
            isChangingSheetStatus={changingSheetStatus}
            onlineOperators={onlineOperators}
            currentUserId={user?.id}
          />

          {loadError && (
            <div role="alert" className="mx-3 mb-2 border border-rose-400 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
              Não foi possível carregar os dados reais: {loadError}. Use “Atualizar” para tentar novamente.
            </div>
          )}

          {/* Grade Operacional Estilo Planilha */}
          <DispatchGrid
            dispatches={filteredDispatches}
            onUpdateRow={handleUpdateRow}
            locations={locations}
            saveState={saveState}
            readOnly={dailySheet?.status !== "OPEN"}
            activeEditors={activeEditors}
            onActiveRowChange={setActiveDispatchId}
          />
        </main>
      </div>
    </div>
  );
}
