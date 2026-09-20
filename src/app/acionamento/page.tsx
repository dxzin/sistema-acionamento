"use client";

import React, { Suspense, useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { matchesDispatchStatus } from "@/lib/calculations/continuity";
import { OperationalAlerts } from "@/components/acionamento/OperationalAlerts";
import { summarizeOperationalAlerts } from "@/lib/calculations/operational-alerts";
import { BellRing, Clock3, X } from "lucide-react";
import {
  buildDispatchReminderDate,
  DEFAULT_REMINDER_VOLUME,
  DispatchReminder,
  dispatchReminderStorageKey,
  dispatchReminderVolumeStorageKey,
  parseDispatchReminders,
  parseDispatchReminderVolume,
  reminderClockTime,
} from "@/lib/reminders/dispatch-reminders";
import {
  createDispatchSaveSnapshot,
  hasPendingDispatchEdits,
  markDispatchSnapshotSaving,
  mergeServerDispatches,
  PendingDispatchEdits,
  resolveDispatchSnapshotFailure,
  resolveDispatchSnapshotSuccess,
  stageDispatchChanges,
} from "@/lib/editing/dispatch-edit-state";

type CellSaveStatus = "pending" | "saving" | "saved" | "error";

function AcionamentoContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dispatches, setDispatches] = useState<DispatchRowModel[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [dailySheet, setDailySheet] = useState<DailySheet | null>(null);
  const [changingSheetStatus, setChangingSheetStatus] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<{ status: "idle" | "saving" | "saved" | "error"; message?: string }>({ status: "idle" });
  const [onlineOperators, setOnlineOperators] = useState<OperatorPresence[]>([]);
  const [activeDispatchId, setActiveDispatchId] = useState<string | null>(null);
  const [editingDispatchId, setEditingDispatchId] = useState<string | null>(null);
  const editingDispatchIdRef = useRef<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"live" | "fallback" | "offline">("fallback");
  const [isExporting, setIsExporting] = useState(false);
  const loadRequestRef = useRef(0);
  const foregroundLoadsRef = useRef(0);
  const syncTokenRef = useRef<string | null>(null);
  const pendingWritesRef = useRef(0);
  const dispatchesRef = useRef<DispatchRowModel[]>([]);
  const pendingEditsRef = useRef<PendingDispatchEdits>({});
  const editVersionRef = useRef(0);
  const saveLoopRef = useRef<Promise<boolean> | null>(null);
  const [cellSaveStates, setCellSaveStates] = useState<Record<string, { status: CellSaveStatus; message?: string }>>({});
  const firedRemindersRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  const [reminders, setReminders] = useState<DispatchReminder[]>([]);
  const [remindersReady, setRemindersReady] = useState(false);
  const [reminderVolume, setReminderVolume] = useState(DEFAULT_REMINDER_VOLUME);
  const [reminderVolumeReady, setReminderVolumeReady] = useState(false);
  const [reminderNow, setReminderNow] = useState(() => Date.now());

  // Filtros
  const [filters, setFilters] = useState<DispatchFilterOptions>({
    searchQuery: "",
    statusFilter: "",
    baseFilter: "",
    shiftFilter: "",
    date: searchParams.get("date") || currentDateInBrasilia(),
    region: (searchParams.get("region") as DispatchFilterOptions["region"]) || "SP",
  });

  useEffect(() => {
    dispatchesRef.current = dispatches;
  }, [dispatches]);

  useEffect(() => {
    if (!Object.values(cellSaveStates).some((state) => state.status === "saved")) return;
    const timer = window.setTimeout(() => {
      setCellSaveStates((current) => Object.fromEntries(
        Object.entries(current).filter(([, state]) => state.status !== "saved")
      ));
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [cellSaveStates]);

  useEffect(() => {
    const requestedDate = searchParams.get("date") || currentDateInBrasilia();
    const requestedRegion = searchParams.get("region");
    const region = requestedRegion === "UBJP" || requestedRegion === "ALL" ? requestedRegion : "SP";
    setFilters((current) => current.date === requestedDate && current.region === region
      ? current
      : { ...current, date: requestedDate, region });
  }, [searchParams]);

  const stageLocalEdits = useCallback((id: string, updates: Partial<DispatchRowModel>) => {
    const expectedUpdatedAt = dispatchesRef.current.find((row) => row.id === id)?.updated_at;
    const next = stageDispatchChanges(
      pendingEditsRef.current,
      id,
      updates,
      expectedUpdatedAt,
      () => ++editVersionRef.current
    );
    pendingEditsRef.current = next;
    setDispatches((current) => current.map((row) => row.id === id ? { ...row, ...updates } : row));
    setCellSaveStates((current) => {
      const updated = { ...current };
      for (const key of Object.keys(updates)) updated[`${id}:${key}`] = { status: "pending" };
      return updated;
    });
    setSaveState({ status: "idle", message: "Alterações pendentes" });
  }, []);

  const flushPendingEdits = useCallback(async (): Promise<boolean> => {
    if (saveLoopRef.current) return saveLoopRef.current;

    const loop = (async () => {
      let completed = true;
      while (true) {
        const snapshot = createDispatchSaveSnapshot(pendingEditsRef.current);
        if (!snapshot.length) break;
        pendingEditsRef.current = markDispatchSnapshotSaving(pendingEditsRef.current, snapshot);
        setCellSaveStates((current) => {
          const next = { ...current };
          for (const item of snapshot) {
            for (const key of Object.keys(item.changes)) next[`${item.id}:${key}`] = { status: "saving" };
          }
          return next;
        });
        pendingWritesRef.current += 1;
        // Invalidate reads started before this write, even if they finish after it.
        loadRequestRef.current += 1;
        setSaveState({ status: "saving" });

        try {
          const saved = await dispatchService.updateDispatchBatch(snapshot.map((item) => ({
            id: item.id,
            changes: item.changes,
            expectedUpdatedAt: item.expectedUpdatedAt,
          })));
          const savedById = new Map(saved.map((row) => [row.id, row]));
          const previousEdits = pendingEditsRef.current;
          pendingEditsRef.current = resolveDispatchSnapshotSuccess(previousEdits, snapshot, saved);

          setDispatches((current) => current.map((row) => {
            const item = snapshot.find((candidate) => candidate.id === row.id);
            const savedRow = savedById.get(row.id);
            if (!item || !savedRow) return row;
            const remaining = pendingEditsRef.current[row.id];
            const remainingChanges = remaining ? Object.fromEntries(
              Object.entries(remaining.fields).map(([key, field]) => [key, field?.value])
            ) as Partial<DispatchRowModel> : {};
            return { ...row, ...savedRow, ...item.changes, ...remainingChanges };
          }));

          setCellSaveStates((current) => {
            const next = { ...current };
            for (const item of snapshot) {
              for (const [key, version] of Object.entries(item.versions)) {
                const pending = pendingEditsRef.current[item.id]?.fields[key as keyof DispatchRowModel];
                next[`${item.id}:${key}`] = pending
                  ? { status: pending.status, message: pending.error }
                  : { status: "saved" };
                if (pending && pending.version === version) next[`${item.id}:${key}`] = { status: "pending" };
              }
            }
            return next;
          });
          setSaveState(hasPendingDispatchEdits(pendingEditsRef.current)
            ? { status: "idle", message: "Alterações pendentes" }
            : { status: "saved" });
        } catch (error) {
          const saveError = error instanceof Error ? error : new Error("Erro ao salvar alteração");
          pendingEditsRef.current = resolveDispatchSnapshotFailure(
            pendingEditsRef.current,
            snapshot,
            saveError.message
          );
          setCellSaveStates((current) => {
            const next = { ...current };
            for (const item of snapshot) {
              for (const key of Object.keys(item.changes)) {
                const field = pendingEditsRef.current[item.id]?.fields[key as keyof DispatchRowModel];
                if (field?.status === "error") next[`${item.id}:${key}`] = { status: "error", message: saveError.message };
              }
            }
            return next;
          });
          setSaveState({ status: "error", message: `${saveError.message} A edição local foi mantida; tente salvar novamente.` });
          completed = false;
          break;
        } finally {
          loadRequestRef.current += 1;
          pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
        }
      }
      return completed && !hasPendingDispatchEdits(pendingEditsRef.current);
    })();

    saveLoopRef.current = loop;
    try {
      return await loop;
    } finally {
      if (saveLoopRef.current === loop) saveLoopRef.current = null;
    }
  }, []);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingDispatchEdits(pendingEditsRef.current)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  useEffect(() => {
    const finishBeforeNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target || anchor.hasAttribute("download") || !hasPendingDispatchEdits(pendingEditsRef.current)) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      void flushPendingEdits().then((saved) => {
        if (saved) router.push(`${destination.pathname}${destination.search}${destination.hash}`);
      });
    };
    document.addEventListener("click", finishBeforeNavigation, true);
    return () => document.removeEventListener("click", finishBeforeNavigation, true);
  }, [flushPendingEdits, router]);

  const loadData = useCallback(async (foreground = true) => {
    if (pendingWritesRef.current > 0) return;
    const requestId = ++loadRequestRef.current;
    if (foreground) {
      foregroundLoadsRef.current += 1;
      setIsLoading(true);
    }
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
        const nextPending = { ...pendingEditsRef.current };
        for (const row of dispatchesData) {
          if (nextPending[row.id]) nextPending[row.id] = { ...nextPending[row.id], expectedUpdatedAt: row.updated_at };
        }
        pendingEditsRef.current = nextPending;
        setDispatches((current) => mergeServerDispatches(dispatchesData, current, nextPending, editingDispatchIdRef.current));
        setLocations(locs);
        setDailySheet(sheet);
        syncTokenRef.current = syncToken;
      }
    } catch (error) {
      console.error("Erro ao carregar dados da folha diária:", error);
      if (requestId === loadRequestRef.current) {
        if (foreground && !hasPendingDispatchEdits(pendingEditsRef.current)) {
          setDispatches([]);
          setDailySheet(null);
        }
        setLoadError(error instanceof Error ? error.message : "Não foi possível carregar a folha diária.");
      }
    } finally {
      if (foreground) {
        foregroundLoadsRef.current = Math.max(0, foregroundLoadsRef.current - 1);
        if (foregroundLoadsRef.current === 0) setIsLoading(false);
      }
    }
  }, [filters.date, filters.region]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => setActiveDispatchId(null), [filters.date, filters.region]);

  useEffect(() => {
    if (!user?.id) {
      setReminders([]);
      setRemindersReady(false);
      return;
    }
    setReminders(parseDispatchReminders(sessionStorage.getItem(dispatchReminderStorageKey(user.id))));
    setRemindersReady(true);
    firedRemindersRef.current.clear();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !remindersReady) return;
    sessionStorage.setItem(dispatchReminderStorageKey(user.id), JSON.stringify(reminders));
  }, [reminders, remindersReady, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setReminderVolume(DEFAULT_REMINDER_VOLUME);
      setReminderVolumeReady(false);
      return;
    }
    setReminderVolume(parseDispatchReminderVolume(
      localStorage.getItem(dispatchReminderVolumeStorageKey(user.id))
    ));
    setReminderVolumeReady(true);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !reminderVolumeReady) return;
    localStorage.setItem(dispatchReminderVolumeStorageKey(user.id), String(reminderVolume));
  }, [reminderVolume, reminderVolumeReady, user?.id]);

  useEffect(() => {
    const interval = window.setInterval(() => setReminderNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const unlockReminderSound = useCallback(() => {
    try {
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      if (audioContextRef.current.state === "suspended") void audioContextRef.current.resume();
    } catch {
      // O aviso visual continua funcionando em navegadores sem Web Audio.
    }
  }, []);

  useEffect(() => {
    const unlockOnInteraction = () => unlockReminderSound();
    window.addEventListener("pointerdown", unlockOnInteraction, { once: true });
    window.addEventListener("keydown", unlockOnInteraction, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockOnInteraction);
      window.removeEventListener("keydown", unlockOnInteraction);
    };
  }, [unlockReminderSound]);

  const playReminderSound = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || reminderVolume <= 0) return;
    void context.resume().then(() => {
      const peakVolume = Math.max(0.0001, (reminderVolume / 100) * 0.4);
      [0, 0.28].forEach((delay, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = index === 0 ? 880 : 1046;
        gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(peakVolume, context.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.2);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(context.currentTime + delay);
        oscillator.stop(context.currentTime + delay + 0.22);
      });
    }).catch(() => undefined);
  }, [reminderVolume]);

  const previewReminderSound = useCallback(() => {
    unlockReminderSound();
    playReminderSound();
  }, [playReminderSound, unlockReminderSound]);

  const dueReminders = useMemo(
    () => reminders
      .filter((reminder) => new Date(reminder.scheduledAt).getTime() <= reminderNow)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [reminderNow, reminders]
  );

  useEffect(() => {
    const newDue = dueReminders.filter((reminder) => !firedRemindersRef.current.has(reminder.dispatchId));
    if (!newDue.length) return;
    newDue.forEach((reminder) => firedRemindersRef.current.add(reminder.dispatchId));
    playReminderSound();
  }, [dueReminders, playReminderSound]);

  const setDispatchReminder = useCallback((dispatchId: string, driverName: string, time: string): string | null => {
    const scheduledAt = buildDispatchReminderDate(filters.date, time);
    if (!scheduledAt) return "Informe um horário válido.";
    if (scheduledAt.getTime() <= Date.now()) return "Esse horário já passou na data desta folha.";

    unlockReminderSound();
    firedRemindersRef.current.delete(dispatchId);
    setReminders((current) => [
      ...current.filter((reminder) => reminder.dispatchId !== dispatchId),
      { dispatchId, driverName, sheetDate: filters.date, scheduledAt: scheduledAt.toISOString() },
    ]);
    return null;
  }, [filters.date, unlockReminderSound]);

  const removeDispatchReminder = useCallback((dispatchId: string) => {
    firedRemindersRef.current.delete(dispatchId);
    setReminders((current) => current.filter((reminder) => reminder.dispatchId !== dispatchId));
  }, []);

  const snoozeDispatchReminder = useCallback((dispatchId: string) => {
    unlockReminderSound();
    firedRemindersRef.current.delete(dispatchId);
    setReminders((current) => current.map((reminder) => reminder.dispatchId === dispatchId
      ? { ...reminder, scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString() }
      : reminder));
  }, [unlockReminderSound]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    let running = false;
    const heartbeat = async () => {
      if (running) return;
      running = true;
      try {
        const presence = await dispatchService.touchAndGetOperatorPresence(
          filters.date, filters.region, activeDispatchId, user.name, user.email
        );
        if (active) setOnlineOperators(presence);
      } catch (error) {
        console.warn("Presença dos operadores temporariamente indisponível:", error);
      } finally {
        running = false;
      }
    };
    void heartbeat();
    const interval = window.setInterval(heartbeat, 10000);
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
    if (pendingWritesRef.current > 0) return;
    void loadData(false);
  }, [loadData]);

  // Sincronização em tempo real via Supabase Realtime
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || url.includes("placeholder")) return;

    const supabase = createClient();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`dispatches_changes:${dailySheet?.id || `${filters.date}:${filters.region}`}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dispatches",
          ...(dailySheet?.id ? { filter: `daily_sheet_id=eq.${dailySheet.id}` } : {}),
        },
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "monthly_schedule_entries" },
        () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(syncFromRemote, 700);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setSyncStatus("live");
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          setSyncStatus(navigator.onLine ? "fallback" : "offline");
        }
      });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [dailySheet?.id, filters.date, filters.region, syncFromRemote]);

  useEffect(() => {
    const online = () => setSyncStatus((current) => current === "offline" ? "fallback" : current);
    const offline = () => setSyncStatus("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if (!navigator.onLine) offline();
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  // Algumas redes corporativas bloqueiam WebSocket. Este verificador leve
  // consulta somente a versão mais recente e recarrega a grade se algo mudou.
  useEffect(() => {
    let checking = false;
    const checkForChanges = async () => {
      if (checking || document.visibilityState !== "visible" || pendingWritesRef.current > 0) return;
      checking = true;
      try {
        const token = await dispatchService.getDailySheetSyncToken(filters.date, filters.region);
        if (syncTokenRef.current !== null && token !== syncTokenRef.current) {
          syncTokenRef.current = token;
          await loadData(false);
        } else {
          syncTokenRef.current = token;
        }
      } catch (error) {
        console.warn("Sincronização automática temporariamente indisponível:", error);
      } finally {
        checking = false;
      }
    };
    if (syncStatus === "offline") return;
    const interval = window.setInterval(checkForChanges, syncStatus === "live" ? 30000 : 5000);
    return () => window.clearInterval(interval);
  }, [filters.date, filters.region, loadData, syncStatus]);

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

  const handleFilterChange = async (newFilters: Partial<DispatchFilterOptions>) => {
    const changesSheet = (newFilters.date && newFilters.date !== filters.date) ||
      (newFilters.region && newFilters.region !== filters.region);
    if (changesSheet && !(await flushPendingEdits())) return;

    const next = { ...filters, ...newFilters };
    setFilters(next);
    if (changesSheet) {
      const params = new URLSearchParams(searchParams.toString());
      if (next.date === currentDateInBrasilia()) params.delete("date");
      else params.set("date", next.date);
      if (next.region === "SP") params.delete("region");
      else params.set("region", next.region);
      const query = params.toString();
      router.replace(query ? `/acionamento?${query}` : "/acionamento", { scroll: false });
    }
  };

  const handleUpdateRow = async (id: string, updates: Partial<DispatchRowModel>) => {
    if (dailySheet?.status !== "OPEN") {
      throw new Error("Esta folha está fechada e disponível somente para consulta.");
    }
    stageLocalEdits(id, updates);
    const saved = await flushPendingEdits();
    if (!saved) throw new Error("A alteração continua pendente e não foi confirmada pelo banco.");
  };

  const handleUpdateBatch = async (updatesByRow: Map<string, Partial<DispatchRowModel>>) => {
    if (dailySheet?.status !== "OPEN") {
      throw new Error("Esta folha está fechada e disponível somente para consulta.");
    }
    for (const [id, updates] of updatesByRow) stageLocalEdits(id, updates);
    const saved = await flushPendingEdits();
    if (!saved) throw new Error("Parte da seleção continua pendente e não foi confirmada pelo banco.");
  };

  const handleManualRefresh = async () => {
    const pendingHasError = Object.values(pendingEditsRef.current).some((row) =>
      Object.values(row.fields).some((field) => field?.status === "error")
    );
    if (pendingHasError) await loadData(false);
    if (hasPendingDispatchEdits(pendingEditsRef.current) && !(await flushPendingEdits())) return;
    await loadData(true);
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
      if (item.id === editingDispatchId) return true;
      // Busca por nome ou login
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        const nameMatch = item.driver.name.toLowerCase().includes(q);
        const loginMatch = item.driver.login_matricula.toLowerCase().includes(q);
        if (!nameMatch && !loginMatch) return false;
      }

      // Filtro por status
      if (!matchesDispatchStatus(item.dispatch_status, filters.statusFilter)) {
        return false;
      }

      // Filtro por turno
      if (filters.shiftFilter && item.driver.default_shift !== filters.shiftFilter) {
        return false;
      }

      return true;
    });
  }, [dispatches, filters, editingDispatchId]);

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

  const operationalAlerts = useMemo(
    () => summarizeOperationalAlerts(filteredDispatches),
    [filteredDispatches]
  );

  const reminderTimes = useMemo(() => Object.fromEntries(
    reminders.map((reminder) => [reminder.dispatchId, reminderClockTime(reminder)])
  ), [reminders]);

  const handleExport = async () => {
    if (!filteredDispatches.length || isExporting) return;
    setIsExporting(true);
    setSaveState({ status: "saving" });
    try {
      const { exportDispatchSheet } = await import("@/lib/exports/dispatch-sheet");
      await exportDispatchSheet(filteredDispatches, filters.date, filters.region);
      setSaveState({ status: "saved" });
    } catch (error) {
      setSaveState({
        status: "error",
        message: error instanceof Error ? error.message : "Não foi possível exportar a folha.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="excel-shell flex min-h-screen flex-1 flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="excel-workspace flex flex-1 flex-col overflow-hidden">
          {/* Barra de Indicadores Operacionais */}
          <DispatchStatsBar summary={summaryKPIs} />

          {/* Filtros e Barra de Ações */}
          <DispatchFilters
            filters={filters}
            onFilterChange={handleFilterChange}
            onRefresh={handleManualRefresh}
            isLoading={isLoading}
            sheetStatus={dailySheet?.status || null}
            onToggleSheetStatus={handleToggleSheetStatus}
            isChangingSheetStatus={changingSheetStatus}
            onlineOperators={onlineOperators}
            currentUserId={user?.id}
            syncStatus={syncStatus}
            onExport={handleExport}
            isExporting={isExporting}
          />

          {!isLoading && !loadError && <OperationalAlerts summary={operationalAlerts} />}

          {loadError && (
            <div role="alert" className="mx-3 mb-2 border border-rose-400 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
              Não foi possível carregar os dados reais: {loadError}. Use “Atualizar” para tentar novamente.
            </div>
          )}

          {/* Grade Operacional Estilo Planilha */}
          <DispatchGrid
            key={filters.region}
            dispatches={filteredDispatches}
            showCity={filters.region === "UBJP"}
            onDraftRow={stageLocalEdits}
            onUpdateRow={handleUpdateRow}
            onUpdateBatch={handleUpdateBatch}
            locations={locations}
            saveState={saveState}
            cellSaveStates={cellSaveStates}
            readOnly={dailySheet?.status !== "OPEN"}
            activeEditors={activeEditors}
            onActiveRowChange={setActiveDispatchId}
            onEditingRowChange={(id) => {
              editingDispatchIdRef.current = id;
              setEditingDispatchId(id);
            }}
            reminderTimes={reminderTimes}
            onSetReminder={setDispatchReminder}
            onRemoveReminder={removeDispatchReminder}
            reminderVolume={reminderVolume}
            onReminderVolumeChange={setReminderVolume}
            onPreviewReminderSound={previewReminderSound}
          />
          {dueReminders.length > 0 && (
            <section className="dispatch-reminder-alert" role="alert" aria-live="assertive">
              <div className="dispatch-reminder-alert-icon"><BellRing aria-hidden="true" /></div>
              <div className="min-w-0 flex-1">
                <strong>Hora de acionar</strong>
                <p className="truncate">{dueReminders[0].driverName}</p>
                <span><Clock3 aria-hidden="true" /> {reminderClockTime(dueReminders[0])}</span>
                {dueReminders.length > 1 && <small>+{dueReminders.length - 1} lembrete(s) vencido(s)</small>}
              </div>
              <div className="dispatch-reminder-alert-actions">
                <button type="button" onClick={() => snoozeDispatchReminder(dueReminders[0].dispatchId)}>Adiar 5 min</button>
                <button type="button" className="is-primary" onClick={() => removeDispatchReminder(dueReminders[0].dispatchId)}>Entendido</button>
              </div>
              <button
                type="button"
                className="dispatch-reminder-alert-close"
                onClick={() => removeDispatchReminder(dueReminders[0].dispatchId)}
                aria-label="Dispensar lembrete"
              ><X /></button>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default function AcionamentoPage() {
  return (
    <Suspense fallback={null}>
      <AcionamentoContent />
    </Suspense>
  );
}
