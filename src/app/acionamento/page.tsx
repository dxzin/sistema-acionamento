"use client";

import React, { Suspense, useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { DispatchStatsBar } from "@/components/acionamento/DispatchStatsBar";
import { DispatchFilters } from "@/components/acionamento/DispatchFilters";
import { DispatchGrid } from "@/components/acionamento/DispatchGrid";
import { dispatchService, SessionExpiredError } from "@/lib/services/dispatch-service";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DispatchRowModel, DispatchFilterOptions, DispatchSummaryKPIs } from "@/types/domain";
import { DailySheet, Location, OperatorPresence } from "@/types/database";
import { currentDateInBrasilia } from "@/lib/dates/operational-date";
import { matchesDispatchStatus } from "@/lib/calculations/continuity";
import { OperationalAlerts } from "@/components/acionamento/OperationalAlerts";
import { JourneyPilotDialog } from "@/components/acionamento/JourneyPilotDialog";
import { JourneyBatchDialog } from "@/components/acionamento/JourneyBatchDialog";
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
import {
  buildJourneyPreview,
  isJourneyEligible,
  resolveJourneyForRecord,
  resolveJourneyRecord,
  snapshotJourneyRecord,
  type JourneyPreview,
  type JourneyRecordSnapshot,
} from "@/lib/sighra/journey";
import { JOURNEY_FEATURE } from "@/lib/sighra/journey-config";
import { createJourneyProvider, journeyEventsFromResult, type JourneyProviderResult } from "@/lib/sighra/journey-provider";
import { recordJourneyAudit } from "@/lib/sighra/journey-audit";
import {
  journeyBatchOutcome,
  matchBatchJobs,
  type JourneyBatchItem,
  type JourneyBatchJob,
} from "@/lib/sighra/journey-batch";

type CellSaveStatus = "pending" | "saving" | "saved" | "error";
type JourneyDialogState = { requested: JourneyRecordSnapshot; result: JourneyProviderResult; preview: JourneyPreview };
type JourneyBatchState = { id: string; records: JourneyRecordSnapshot[]; jobs: JourneyBatchJob[] };

function AcionamentoContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dispatches, setDispatches] = useState<DispatchRowModel[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [dailySheet, setDailySheet] = useState<DailySheet | null>(null);
  const [dailySheets, setDailySheets] = useState<DailySheet[]>([]);
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
  const reminderAudioRef = useRef<HTMLAudioElement | null>(null);
  const [reminders, setReminders] = useState<DispatchReminder[]>([]);
  const [remindersReady, setRemindersReady] = useState(false);
  const [reminderVolume, setReminderVolume] = useState(DEFAULT_REMINDER_VOLUME);
  const [reminderVolumeReady, setReminderVolumeReady] = useState(false);
  const [reminderNow, setReminderNow] = useState(() => Date.now());
  const journeyProvider = useMemo(() => createJourneyProvider(), []);
  const [journeyRequestingId, setJourneyRequestingId] = useState<string | null>(null);
  const [journeyDialog, setJourneyDialog] = useState<JourneyDialogState | null>(null);
  const [journeySaving, setJourneySaving] = useState(false);
  const [journeyError, setJourneyError] = useState<string | null>(null);
  const [journeyBatch, setJourneyBatch] = useState<JourneyBatchState | null>(null);
  const [journeyBatchRequesting, setJourneyBatchRequesting] = useState(false);
  const [journeyBatchApplying, setJourneyBatchApplying] = useState(false);
  const [journeyBatchError, setJourneyBatchError] = useState<string | null>(null);
  const journeyRequestRef = useRef(0);
  const journeyAbortRef = useRef<AbortController | null>(null);
  const journeyBatchAuditedRef = useRef<Set<string>>(new Set());

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

  useEffect(() => () => journeyAbortRef.current?.abort(), []);

  const activeJourneyBatchId = journeyBatch?.jobs.some((job) => ["queued", "running"].includes(job.status))
    ? journeyBatch.id
    : null;

  useEffect(() => {
    if (!activeJourneyBatchId) return;
    let stopped = false;
    let timer: number | null = null;
    const poll = async () => {
      if (stopped) return;
      try {
        const response = await fetch(`/api/integracoes/sighra/consultas/lote?id=${activeJourneyBatchId}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.erro || "Não foi possível acompanhar o lote.");
        const jobs = body.jobs as JourneyBatchJob[];
        if (stopped) return;
        setJourneyBatch((current) => current?.id === activeJourneyBatchId ? { ...current, jobs } : current);
        setJourneyBatchError(null);
        if (jobs.some((job) => ["queued", "running"].includes(job.status))) {
          timer = window.setTimeout(poll, 2_000);
        }
      } catch (error) {
        if (stopped) return;
        setJourneyBatchError(error instanceof Error ? error.message : "Não foi possível acompanhar o lote.");
        timer = window.setTimeout(poll, 4_000);
      }
    };
    timer = window.setTimeout(poll, 1_000);
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [activeJourneyBatchId]);

  const journeyBatchItems = useMemo<JourneyBatchItem[]>(() => {
    if (!journeyBatch) return [];
    const matchedJobs = matchBatchJobs(journeyBatch.records, journeyBatch.jobs);
    return journeyBatch.records.map((requested, index) => {
      const job = matchedJobs[index];
      let preview: JourneyPreview | null = null;
      if (job?.status === "completed" && Array.isArray(job.result?.journey_events)) {
        const result: JourneyProviderResult = {
          provider: job.simulation === true ? "mock" : journeyProvider.kind,
          requestedAt: job.created_at,
          queryId: job.id,
          events: journeyEventsFromResult(job.result),
        };
        const resolved = resolveJourneyRecord(dispatches, requested, filters.date);
        if (resolved.row) {
          const freshRecord = snapshotJourneyRecord(resolved.row, requested.operationalDate);
          preview = buildJourneyPreview(freshRecord, resolveJourneyForRecord(result.events, freshRecord));
        } else {
          preview = buildJourneyPreview(requested, {
            status: "ambiguous",
            pair: null,
            message: "O registro mudou durante a consulta e precisa de conferência.",
            reasons: [resolved.reason || "Registro incompatível."],
          });
        }
      }
      return { record: requested, job, preview, outcome: journeyBatchOutcome(job, preview) };
    });
  }, [dispatches, filters.date, journeyBatch, journeyProvider.kind]);

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
      const [locs, sheets, syncToken] = await Promise.all([
        dispatchService.getLocations(),
        dispatchService.getDailySheets(filters.date, filters.region),
        dispatchService.getDailySheetSyncToken(filters.date, filters.region),
      ]);
      const sheet = filters.region === "ALL" ? null : sheets[0] || null;

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
        setDailySheets(sheets);
        syncTokenRef.current = syncToken;
      }
    } catch (error) {
      console.error("Erro ao carregar dados da folha diária:", error);
      if (requestId === loadRequestRef.current) {
        if (foreground && !hasPendingDispatchEdits(pendingEditsRef.current)) {
          setDispatches([]);
          setDailySheet(null);
          setDailySheets([]);
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

  const selectedSheetsOpen = dailySheets.length > 0 && dailySheets.every((sheet) => sheet.status === "OPEN");

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
    const now = Date.now();
    const nextReminderAt = reminders
      .map((reminder) => Date.parse(reminder.scheduledAt))
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now)
      .sort((a, b) => a - b)[0];
    if (!nextReminderAt) return;
    // Atualiza somente quando o próximo lembrete vence. A grade possui mais de
    // mil controles e não deve ser renderizada novamente a cada segundo.
    const timer = window.setTimeout(
      () => setReminderNow(Date.now()),
      Math.min(nextReminderAt - now + 50, 2_147_000_000)
    );
    return () => window.clearTimeout(timer);
  }, [reminders, reminderNow]);

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

  const playFallbackReminderSound = useCallback(() => {
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

  const playReminderSound = useCallback(() => {
    if (reminderVolume <= 0) return;
    const audio = reminderAudioRef.current || new Audio("/audio/alarme.mp3");
    reminderAudioRef.current = audio;
    audio.volume = reminderVolume / 100;
    audio.pause();
    audio.currentTime = 0;
    let usedFallback = false;
    const fallback = () => {
      if (usedFallback) return;
      usedFallback = true;
      playFallbackReminderSound();
    };
    audio.onerror = fallback;
    void audio.play().catch(fallback);
  }, [playFallbackReminderSound, reminderVolume]);

  const stopReminderSound = useCallback(() => {
    const audio = reminderAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  useEffect(() => () => reminderAudioRef.current?.pause(), []);

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
    stopReminderSound();
    firedRemindersRef.current.delete(dispatchId);
    setReminders((current) => current.filter((reminder) => reminder.dispatchId !== dispatchId));
  }, [stopReminderSound]);

  const snoozeDispatchReminder = useCallback((dispatchId: string) => {
    stopReminderSound();
    unlockReminderSound();
    firedRemindersRef.current.delete(dispatchId);
    setReminders((current) => current.map((reminder) => reminder.dispatchId === dispatchId
      ? { ...reminder, scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString() }
      : reminder));
  }, [stopReminderSound, unlockReminderSound]);

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
        if (active) setOnlineOperators((current) => {
          const unchanged = current.length === presence.length && current.every((operator, index) => {
            const next = presence[index];
            return next && operator.user_id === next.user_id && operator.display_name === next.display_name &&
              operator.email === next.email && operator.active_dispatch_id === next.active_dispatch_id;
          });
          return unchanged ? current : presence;
        });
      } catch (error) {
        if (error instanceof SessionExpiredError) {
          if (active) {
            setOnlineOperators([]);
            void logout();
          }
          return;
        }
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
  }, [activeDispatchId, filters.date, filters.region, logout, user]);

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

  const handleUpdateRow = useCallback(async (id: string, updates: Partial<DispatchRowModel>) => {
    if (!selectedSheetsOpen) {
      throw new Error("Esta folha está fechada e disponível somente para consulta.");
    }
    stageLocalEdits(id, updates);
    const saved = await flushPendingEdits();
    if (!saved) throw new Error("A alteração continua pendente e não foi confirmada pelo banco.");
  }, [flushPendingEdits, selectedSheetsOpen, stageLocalEdits]);

  const handleUpdateBatch = useCallback(async (updatesByRow: Map<string, Partial<DispatchRowModel>>) => {
    if (!selectedSheetsOpen) {
      throw new Error("Esta folha está fechada e disponível somente para consulta.");
    }
    for (const [id, updates] of updatesByRow) stageLocalEdits(id, updates);
    const saved = await flushPendingEdits();
    if (!saved) throw new Error("Parte da seleção continua pendente e não foi confirmada pelo banco.");
  }, [flushPendingEdits, selectedSheetsOpen, stageLocalEdits]);

  const handleManualRefresh = async () => {
    const pendingHasError = Object.values(pendingEditsRef.current).some((row) =>
      Object.values(row.fields).some((field) => field?.status === "error")
    );
    if (pendingHasError) await loadData(false);
    if (hasPendingDispatchEdits(pendingEditsRef.current) && !(await flushPendingEdits())) return;
    await loadData(true);
  };

  const auditJourney = useCallback((
    record: JourneyRecordSnapshot,
    outcome: Parameters<typeof recordJourneyAudit>[0]["outcome"],
    result?: JourneyProviderResult,
    preview?: JourneyPreview,
    reason?: string
  ) => {
    const pair = preview?.resolution.status === "safe" ? preview.resolution.pair : null;
    const manualEnd = preview?.resolution.status === "manual_end" ? preview.resolution.end : null;
    return recordJourneyAudit({
      recordId: record.recordId,
      login: record.login,
      operationalDate: record.operationalDate,
      shift: record.shift,
      status: record.status,
      requestedAt: result?.requestedAt || new Date().toISOString(),
      outcome,
      result: preview?.resolution.status || null,
      startTimestamp: pair?.start.occurredAt || null,
      endTimestamp: pair?.end?.occurredAt || manualEnd?.occurredAt || null,
      startMacroId: pair?.start.id || null,
      endMacroId: pair?.end?.id || manualEnd?.id || null,
      queryId: result?.queryId || null,
      reason: reason || (preview?.resolution.status === "manual_end" ? "Saída conferida com entrada já preenchida."
        : preview?.resolution.status !== "safe" ? preview?.resolution.reasons.join(" ") : null),
    }, journeyProvider.kind);
  }, [journeyProvider]);

  useEffect(() => {
    for (const item of journeyBatchItems) {
      if (!item.job || item.outcome === "pending" || journeyBatchAuditedRef.current.has(item.job.id)) continue;
      journeyBatchAuditedRef.current.add(item.job.id);
      if (item.job.status === "completed" && Array.isArray(item.job.result?.journey_events) && item.preview) {
        const result: JourneyProviderResult = {
          provider: item.job.simulation === true ? "mock" : journeyProvider.kind,
          requestedAt: item.job.created_at,
          queryId: item.job.id,
          events: journeyEventsFromResult(item.job.result),
        };
        void auditJourney(
          item.preview.record,
          item.outcome === "safe" || item.outcome === "unchanged" ? "preview" : "blocked",
          result,
          item.preview
        );
      } else {
        void auditJourney(item.record, "failed", undefined, undefined, item.job.error || "Consulta em lote não concluída.");
      }
    }
  }, [auditJourney, journeyBatchItems, journeyProvider.kind]);

  const requestJourneyBatch = useCallback(async (recordIds: string[]) => {
    if (journeyBatchRequesting || recordIds.length === 0) return;
    const selected = [...new Set(recordIds)]
      .map((id) => dispatchesRef.current.find((row) => row.id === id))
      .filter((row): row is DispatchRowModel => Boolean(row && isJourneyEligible(row.dispatch_status) && row.driver.login_matricula?.trim()));
    if (selected.length > 50) {
      setSaveState({ status: "error", message: "Selecione no máximo 50 condutores por consulta em lote." });
      return;
    }
    if (hasPendingDispatchEdits(pendingEditsRef.current) && !(await flushPendingEdits())) return;
    const records = selected.map((row) => snapshotJourneyRecord(row, filters.date));
    if (!records.length) return;
    setJourneyBatchRequesting(true);
    setJourneyBatchError(null);
    journeyBatchAuditedRef.current.clear();
    try {
      const response = await fetch("/api/integracoes/sighra/consultas/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since: filters.date, logins: records.map((record) => record.login) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.erro || "Não foi possível iniciar a consulta em lote.");
      for (const record of records) void auditJourney(record, "requested");
      setJourneyDialog(null);
      setJourneyBatch({ id: body.id, records, jobs: body.jobs as JourneyBatchJob[] });
    } catch (error) {
      setSaveState({
        status: "error",
        message: error instanceof Error ? error.message : "Não foi possível iniciar a consulta em lote.",
      });
    } finally {
      setJourneyBatchRequesting(false);
    }
  }, [auditJourney, filters.date, flushPendingEdits, journeyBatchRequesting]);

  const closeJourneyBatch = useCallback(() => {
    setJourneyBatch(null);
    setJourneyBatchError(null);
  }, []);

  const cancelJourneyBatch = useCallback(() => {
    if (!journeyBatch) return;
    const id = journeyBatch.id;
    for (const item of journeyBatchItems.filter((candidate) => candidate.outcome === "pending")) {
      void auditJourney(item.record, "canceled", undefined, undefined, "Consulta em lote cancelada pelo operador.");
    }
    setJourneyBatch(null);
    setJourneyBatchError(null);
    void fetch(`/api/integracoes/sighra/consultas/lote?id=${id}`, { method: "DELETE", keepalive: true });
  }, [auditJourney, journeyBatch, journeyBatchItems]);

  const retryJourneyBatchFailures = useCallback(() => {
    const ids = journeyBatchItems
      .filter((item) => item.outcome === "failed")
      .map((item) => item.record.recordId);
    setJourneyBatch(null);
    setJourneyBatchError(null);
    window.setTimeout(() => { void requestJourneyBatch(ids); }, 0);
  }, [journeyBatchItems, requestJourneyBatch]);

  const applyJourneyBatch = useCallback(async () => {
    if (!journeyBatch || journeyBatchApplying) return;
    const updates = new Map<string, Partial<DispatchRowModel>>();
    const applied: Array<{ record: JourneyRecordSnapshot; result: JourneyProviderResult; preview: JourneyPreview }> = [];
    for (const item of journeyBatchItems.filter((candidate) => candidate.outcome === "safe")) {
      if (!item.job?.result?.journey_events) continue;
      const result: JourneyProviderResult = {
        provider: item.job.simulation === true ? "mock" : journeyProvider.kind,
        requestedAt: item.job.created_at,
        queryId: item.job.id,
        events: journeyEventsFromResult(item.job.result),
      };
      const resolved = resolveJourneyRecord(dispatchesRef.current, item.record, filters.date);
      if (!resolved.row) {
        void auditJourney(item.record, "blocked", result, item.preview || undefined, resolved.reason || undefined);
        continue;
      }
      const freshRecord = snapshotJourneyRecord(resolved.row, item.record.operationalDate);
      const preview = buildJourneyPreview(freshRecord, resolveJourneyForRecord(result.events, freshRecord));
      if (!preview.canApply) {
        void auditJourney(freshRecord, "blocked", result, preview, "Revalidação do lote bloqueou a aplicação.");
        continue;
      }
      updates.set(freshRecord.recordId, preview.changes);
      applied.push({ record: freshRecord, result, preview });
    }
    if (!updates.size) {
      setJourneyBatchError("Nenhuma jornada continua segura para aplicação. Revise os resultados novamente.");
      return;
    }
    setJourneyBatchApplying(true);
    setJourneyBatchError(null);
    try {
      await handleUpdateBatch(updates);
      await Promise.allSettled(applied.map(({ record, result, preview }) => auditJourney(record, "applied", result, preview)));
      setJourneyBatch(null);
      setSaveState({ status: "saved", message: `${updates.size} jornada(s) aplicada(s) com segurança.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível aplicar as jornadas seguras.";
      setJourneyBatchError(message);
      for (const { record, result, preview } of applied) void auditJourney(record, "failed", result, preview, message);
    } finally {
      setJourneyBatchApplying(false);
    }
  }, [auditJourney, filters.date, handleUpdateBatch, journeyBatch, journeyBatchApplying, journeyBatchItems, journeyProvider.kind]);

  const requestJourney = useCallback(async (recordId: string) => {
    const initialRow = dispatchesRef.current.find((row) => row.id === recordId);
    if (!initialRow || !isJourneyEligible(initialRow.dispatch_status)) return;
    if (!initialRow.driver.login_matricula?.trim()) {
      setSaveState({ status: "error", message: "O condutor não possui login para consulta SIGhRa." });
      return;
    }
    if (hasPendingDispatchEdits(pendingEditsRef.current) && !(await flushPendingEdits())) return;
    const currentRow = dispatchesRef.current.find((row) => row.id === recordId);
    if (!currentRow || !isJourneyEligible(currentRow.dispatch_status)) return;
    const requested = snapshotJourneyRecord(currentRow, filters.date);
    const requestNumber = ++journeyRequestRef.current;
    journeyAbortRef.current?.abort();
    const controller = new AbortController();
    journeyAbortRef.current = controller;
    setJourneyRequestingId(recordId);
    setJourneyDialog(null);
    setJourneyError(null);
    void auditJourney(requested, "requested");
    try {
      const result = await journeyProvider.fetchJourneyEvents(requested, controller.signal);
      if (requestNumber !== journeyRequestRef.current || controller.signal.aborted) return;
      const resolved = resolveJourneyRecord(dispatchesRef.current, requested, filters.date);
      if (!resolved.row) {
        const preview = buildJourneyPreview(requested, {
          status: "ambiguous", pair: null,
          message: "Jornada não identificada com segurança. Necessária conferência manual.",
          reasons: [resolved.reason || "Registro incompatível."],
        });
        setJourneyDialog({ requested, result, preview });
        void auditJourney(requested, "blocked", result, preview, resolved.reason || undefined);
        return;
      }
      const freshRecord = snapshotJourneyRecord(resolved.row, requested.operationalDate);
      const preview = buildJourneyPreview(freshRecord, resolveJourneyForRecord(result.events, freshRecord));
      setJourneyDialog({ requested, result, preview });
      void auditJourney(freshRecord, preview.resolution.status === "safe" || preview.resolution.status === "manual_end" ? "preview" : "blocked", result, preview);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Não foi possível consultar a jornada.";
      const result: JourneyProviderResult = { provider: journeyProvider.kind, requestedAt: new Date().toISOString(), queryId: "", events: [] };
      const preview = buildJourneyPreview(requested, {
        status: "ambiguous", pair: null,
        message: "Jornada não identificada com segurança. Necessária conferência manual.",
        reasons: [message],
      });
      setJourneyDialog({ requested, result, preview });
      setJourneyError(message);
      void auditJourney(requested, "failed", result, preview, message);
    } finally {
      if (requestNumber === journeyRequestRef.current) setJourneyRequestingId(null);
    }
  }, [auditJourney, filters.date, flushPendingEdits, journeyProvider]);

  const cancelJourney = useCallback(() => {
    if (journeyDialog) void auditJourney(journeyDialog.preview.record, "canceled", journeyDialog.result, journeyDialog.preview);
    setJourneyDialog(null);
    setJourneyError(null);
  }, [auditJourney, journeyDialog]);

  const applyJourney = useCallback(async () => {
    if (!journeyDialog || journeySaving) return;
    const resolved = resolveJourneyRecord(dispatchesRef.current, journeyDialog.requested, filters.date);
    if (!resolved.row) {
      setJourneyError(resolved.reason || "O registro original não pode mais ser alterado.");
      return;
    }
    const freshRecord = snapshotJourneyRecord(resolved.row, journeyDialog.requested.operationalDate);
    const preview = buildJourneyPreview(freshRecord, resolveJourneyForRecord(journeyDialog.result.events, freshRecord));
    setJourneyDialog((current) => current ? { ...current, preview } : current);
    if (!preview.canApply) {
      setJourneyError(preview.conflicts.length
        ? "A aplicação foi bloqueada porque existe valor manual divergente."
        : "A jornada não possui alteração segura para aplicar.");
      void auditJourney(freshRecord, "blocked", journeyDialog.result, preview, "Revalidação anterior à gravação bloqueou a aplicação.");
      return;
    }
    setJourneySaving(true);
    setJourneyError(null);
    try {
      await handleUpdateRow(freshRecord.recordId, preview.changes);
      await auditJourney(freshRecord, "applied", journeyDialog.result, preview);
      setJourneyDialog(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível aplicar a jornada.";
      setJourneyError(message);
      void auditJourney(freshRecord, "failed", journeyDialog.result, preview, message);
    } finally {
      setJourneySaving(false);
    }
  }, [auditJourney, filters.date, handleUpdateRow, journeyDialog, journeySaving]);

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
            sheetStatus={filters.region === "ALL" ? null : dailySheet?.status || null}
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
            showCity={filters.region !== "SP"}
            onDraftRow={stageLocalEdits}
            onUpdateRow={handleUpdateRow}
            onUpdateBatch={handleUpdateBatch}
            locations={locations}
            saveState={saveState}
            cellSaveStates={cellSaveStates}
            readOnly={!selectedSheetsOpen}
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
            journeyPilotEnabled={JOURNEY_FEATURE.pilotEnabled}
            journeyRequestingId={journeyRequestingId}
            journeyBatchRequesting={journeyBatchRequesting || Boolean(journeyBatch)}
            onRequestJourney={(id) => { void requestJourney(id); }}
            onRequestJourneyBatch={(ids) => { void requestJourneyBatch(ids); }}
          />
          {journeyDialog && (
            <JourneyPilotDialog
              preview={journeyDialog.preview}
              provider={journeyDialog.result.provider}
              saving={journeySaving}
              error={journeyError}
              onApply={() => { void applyJourney(); }}
              onCancel={cancelJourney}
              onForceSearch={() => { const id = journeyDialog.requested.recordId; setJourneyDialog(null); void requestJourney(id); }}
            />
          )}
          {journeyBatch && (
            <JourneyBatchDialog
              items={journeyBatchItems}
              applying={journeyBatchApplying}
              error={journeyBatchError}
              onApplySafe={() => { void applyJourneyBatch(); }}
              onCancel={cancelJourneyBatch}
              onClose={closeJourneyBatch}
              onRetryFailures={retryJourneyBatchFailures}
            />
          )}
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
