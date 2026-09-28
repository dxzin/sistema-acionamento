import type { DispatchRowModel } from "@/types/domain";

export const JOURNEY_ELIGIBLE_STATUSES = ["ACIONADO", "TROCA", "APOIO"] as const;
export const JOURNEY_DUPLICATE_START_WINDOW_MS = 60 * 1000;
export const JOURNEY_DUPLICATE_END_WINDOW_MS = 5 * 60 * 1000;

export type JourneyFeatureMode = "disabled" | "pilot" | "automatic";
export type JourneyEventType = "start" | "end" | "intermediate";

export interface JourneyRecordSnapshot {
  recordId: string;
  login: string;
  driverName: string;
  operationalDate: string;
  shift: string;
  status: string;
  entryTime: string | null;
  exitTime: string | null;
  fleetCode: string | null;
  updatedAt: string;
}

export interface JourneyEvent {
  id: string;
  login: string;
  name: string;
  type: JourneyEventType;
  occurredAt: string;
  receivedAt: string | null;
  vehicle: string | null;
  plate?: string | null;
  location?: string | null;
}

export interface JourneyPair {
  start: JourneyEvent;
  end: JourneyEvent | null;
  restart?: JourneyEvent | null;
}

export type JourneyResolution =
  | { status: "safe"; pair: JourneyPair; message: string }
  | { status: "manual_end"; pair: null; end: JourneyEvent; message: string; reasons: string[] }
  | { status: "not_found" | "ambiguous"; pair: null; message: string; reasons: string[] };

export interface JourneyFieldConflict {
  field: "entry_time" | "exit_time" | "fleet_code";
  current: string;
  sighra: string;
}

export interface JourneyPreview {
  record: JourneyRecordSnapshot;
  resolution: JourneyResolution;
  conflicts: JourneyFieldConflict[];
  preservedPlate?: { current: string; sighra: string };
  changes: Partial<Pick<DispatchRowModel, "entry_time" | "exit_time" | "fleet_code">>;
  canApply: boolean;
}

const normalizeText = (value: string | null | undefined) => (value || "")
  .trim()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleUpperCase("pt-BR");

const normalizeLogin = (value: string) => value.replace(/^0+(?=\d)/, "");

export function isJourneyEligible(status: string | null | undefined) {
  return JOURNEY_ELIGIBLE_STATUSES.includes(normalizeText(status) as typeof JOURNEY_ELIGIBLE_STATUSES[number]);
}

export function classifyJourneyEvent(name: string): JourneyEventType {
  const normalized = normalizeText(name);
  if (normalized === "INICIO DE JORNADA" || normalized === "INICIO DE JORNADA GA") return "start";
  if (normalized === "FIM DE JORNADA" || normalized === "FIM DE JORNADA GA") return "end";
  return "intermediate";
}

function isTravelRestart(event: JourneyEvent) {
  const name = normalizeText(event.name);
  return name === "REINICIO DE VIAGEM" || name === "REINICIO DE VIAGEM GA";
}

function validJourneyPlate(value: string | null | undefined) {
  const plate = value?.trim().toUpperCase() || "";
  return /^[A-Z0-9-]{5,20}$/.test(plate) ? plate : null;
}

export function clockTime(timestamp: string) {
  return `${timestamp.slice(11, 16)}:00`;
}

export function snapshotJourneyRecord(row: DispatchRowModel, operationalDate: string): JourneyRecordSnapshot {
  return {
    recordId: row.id,
    login: row.driver.login_matricula.trim(),
    driverName: row.driver.name,
    operationalDate,
    shift: row.driver.default_start_time || row.driver.default_shift || "",
    status: row.dispatch_status,
    entryTime: row.entry_time || null,
    exitTime: row.exit_time || null,
    fleetCode: row.fleet_code || row.vehicle?.plate_code || null,
    updatedAt: row.updated_at,
  };
}

export function resolveJourneyRecord(
  rows: DispatchRowModel[],
  requested: Pick<JourneyRecordSnapshot, "recordId" | "login" | "operationalDate">,
  currentOperationalDate: string
) {
  const row = rows.find((candidate) => candidate.id === requested.recordId) || null;
  if (!row) return { row: null, reason: "O registro original não está mais nesta folha." };
  if (currentOperationalDate !== requested.operationalDate) return { row: null, reason: "A data da folha mudou durante a consulta." };
  if (normalizeLogin(row.driver.login_matricula) !== normalizeLogin(requested.login)) {
    return { row: null, reason: "O login do registro mudou durante a consulta." };
  }
  if (!isJourneyEligible(row.dispatch_status)) return { row: null, reason: "O status deixou de ser elegível durante a consulta." };
  return { row, reason: null };
}

export function pairJourneyEvents(events: JourneyEvent[]): { pairs: JourneyPair[]; reasons: string[] } {
  const unique = new Map<string, JourneyEvent>();
  for (const event of events) {
    const key = event.id || `${event.login}|${event.name}|${event.occurredAt}`;
    if (!unique.has(key)) unique.set(key, event);
  }
  const ordered = collapseNearDuplicateJourneyEvents([...unique.values()]
    .filter((event) => event.type !== "intermediate")
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)));
  const pairs: JourneyPair[] = [];
  const reasons: string[] = [];
  let open: JourneyEvent | null = null;

  for (const event of ordered) {
    if (event.type === "start") {
      if (open) {
        reasons.push(`Mais de um início sem fim entre ${open.occurredAt} e ${event.occurredAt}.`);
      } else {
        open = event;
      }
      continue;
    }
    if (!open) {
      reasons.push(`Fim de jornada sem início em ${event.occurredAt}.`);
      continue;
    }
    pairs.push({ start: open, end: event });
    open = null;
  }
  if (open) pairs.push({ start: open, end: null });
  return { pairs, reasons };
}

function collapseNearDuplicateJourneyEvents(events: JourneyEvent[]): JourneyEvent[] {
  const collapsed: JourneyEvent[] = [];
  for (const event of events) {
    const previous = collapsed.at(-1);
    if (previous?.type === event.type && (event.type === "start" || event.type === "end")) {
      const difference = Date.parse(event.occurredAt) - Date.parse(previous.occurredAt);
      const tolerance = event.type === "start" ? JOURNEY_DUPLICATE_START_WINDOW_MS : JOURNEY_DUPLICATE_END_WINDOW_MS;
      if (Number.isFinite(difference) && difference >= 0 && difference <= tolerance) continue;
    }
    collapsed.push(event);
  }
  return collapsed;
}

export function resolveJourneyForRecord(events: JourneyEvent[], record: JourneyRecordSnapshot): JourneyResolution {
  if (!isJourneyEligible(record.status)) {
    return { status: "ambiguous", pair: null, message: "Registro não elegível para consulta SIGhRa.", reasons: ["Status não permitido."] };
  }
  if (!record.login || !/^\d{1,20}$/.test(record.login)) {
    return { status: "ambiguous", pair: null, message: "Jornada não identificada com segurança. Necessária conferência manual.", reasons: ["Login ausente ou inválido."] };
  }
  const sameDriver = events.filter((event) => normalizeLogin(event.login) === normalizeLogin(record.login));
  if (sameDriver.length !== events.length) {
    return { status: "ambiguous", pair: null, message: "Jornada não identificada com segurança. Necessária conferência manual.", reasons: ["A resposta contém evento de outro login."] };
  }
  const unique = new Map<string, JourneyEvent>();
  for (const event of sameDriver) {
    const key = event.id || `${event.login}|${event.name}|${event.occurredAt}`;
    if (!unique.has(key) && event.type !== "intermediate") unique.set(key, event);
  }
  // O SIGhRa pode repetir a confirmação de início ou fim. Eventos consecutivos
  // próximos representam uma única ocorrência; preservamos o primeiro recebido.
  // A tolerância é de 1 minuto para início e 5 minutos para fim.
  const ordered = collapseNearDuplicateJourneyEvents(
    [...unique.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  );
  const starts = ordered.filter((event) => event.type === "start" && event.occurredAt.slice(0, 10) === record.operationalDate);
  // Uma entrada já preenchida pode representar uma carona sem macro de início.
  // Um fim anterior ao próximo início SIGhRa pode fechar somente essa entrada.
  const manualStart = record.entryTime && /^([01]\d|2[0-3]):[0-5]\d/.test(record.entryTime)
    ? `${record.operationalDate}T${record.entryTime.slice(0, 5)}:00`
    : null;
  let earlierStartOpen = false;
  if (manualStart) {
    for (const event of ordered) {
      if (event.occurredAt.slice(0, 16) > manualStart.slice(0, 16)) break;
      if (event.type === "start") earlierStartOpen = true;
      if (event.type === "end") earlierStartOpen = false;
    }
  }
  if (manualStart && !earlierStartOpen) {
    const nextStart = ordered.find((event) => event.type === "start" && event.occurredAt > manualStart);
    const deadline = Date.parse(manualStart) + 36 * 60 * 60 * 1000;
    const ends = ordered.filter((event) => event.type === "end" &&
      event.occurredAt.slice(0, 16) > manualStart.slice(0, 16) &&
      Date.parse(event.occurredAt) <= deadline &&
      (!nextStart || event.occurredAt < nextStart.occurredAt));
    if (ends.length === 1) {
      return {
        status: "manual_end", pair: null, end: ends[0], reasons: [],
        message: "Fim encontrado após a entrada já preenchida. Confira antes de aplicar somente a saída.",
      };
    }
    if (ends.length > 1) {
      return {
        status: "ambiguous", pair: null,
        message: "Jornada não identificada com segurança. Necessária conferência manual.",
        reasons: ["Há mais de um fim de jornada após a entrada preenchida."],
      };
    }
  }
  if (starts.length > 1) {
    return {
      status: "ambiguous",
      pair: null,
      message: "Jornada não identificada com segurança. Necessária conferência manual.",
      reasons: ["Há múltiplos inícios na data operacional."],
    };
  }
  if (starts.length === 0) {
    const hasOrphanEnd = ordered.some((event) => event.type === "end" && event.occurredAt.slice(0, 10) >= record.operationalDate);
    return hasOrphanEnd
      ? { status: "ambiguous", pair: null, message: "Jornada não identificada com segurança. Necessária conferência manual.", reasons: ["Há fim de jornada sem início compatível."] }
      : { status: "not_found", pair: null, message: "Nenhum início de jornada foi encontrado para a data operacional.", reasons: ["Sem início compatível."] };
  }
  const start = starts[0];
  const afterStart = ordered.slice(ordered.indexOf(start) + 1);
  const nextStartIndex = afterStart.findIndex((event) => event.type === "start");
  const nextEndIndex = afterStart.findIndex((event) => event.type === "end");
  if (nextStartIndex >= 0 && (nextEndIndex < 0 || nextStartIndex < nextEndIndex)) {
    return { status: "ambiguous", pair: null, message: "Jornada não identificada com segurança. Necessária conferência manual.", reasons: ["Há outro início antes do fim da jornada."] };
  }
  const end = nextEndIndex >= 0 ? afterStart[nextEndIndex] : null;
  if (end) {
    const untilNextStart = afterStart.slice(nextEndIndex + 1, nextStartIndex >= 0 ? nextStartIndex : undefined);
    if (untilNextStart.some((event) => event.type === "end")) {
      return { status: "ambiguous", pair: null, message: "Jornada não identificada com segurança. Necessária conferência manual.", reasons: ["Há múltiplos fins possíveis para o mesmo início."] };
    }
  }
  // Apenas as duas primeiras macros de reinício desta jornada podem fornecer a placa.
  // Nunca usamos a placa do início, do fim ou de outra jornada.
  const restart = sameDriver
    .filter((event) => isTravelRestart(event) && event.occurredAt > start.occurredAt && (!end || event.occurredAt < end.occurredAt))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .slice(0, 2)
    .find((event) => validJourneyPlate(event.plate)) || null;
  const pair = { start, end, restart };
  return {
    status: "safe",
    pair,
    message: end
      ? "Jornada identificada com segurança."
      : "Fim ainda não encontrado. Jornada em andamento.",
  };
}

export function buildJourneyPreview(record: JourneyRecordSnapshot, resolution: JourneyResolution): JourneyPreview {
  if (resolution.status === "manual_end") {
    const exit = clockTime(resolution.end.occurredAt);
    const conflicts: JourneyFieldConflict[] = record.exitTime && record.exitTime !== exit
      ? [{ field: "exit_time", current: record.exitTime, sighra: exit }]
      : [];
    const changes: JourneyPreview["changes"] = record.exitTime ? {} : { exit_time: exit };
    return { record, resolution, conflicts, changes, canApply: conflicts.length === 0 && !record.exitTime };
  }
  if (resolution.status !== "safe") return { record, resolution, conflicts: [], changes: {}, canApply: false };
  const entry = clockTime(resolution.pair.start.occurredAt);
  const exit = resolution.pair.end ? clockTime(resolution.pair.end.occurredAt) : null;
  const plate = validJourneyPlate(resolution.pair.restart?.plate);
  const conflicts: JourneyFieldConflict[] = [];
  if (record.entryTime && record.entryTime !== entry) conflicts.push({ field: "entry_time", current: record.entryTime, sighra: entry });
  if (exit && record.exitTime && record.exitTime !== exit) conflicts.push({ field: "exit_time", current: record.exitTime, sighra: exit });
  const preservedPlate = plate && record.fleetCode && record.fleetCode.trim().toUpperCase() !== plate
    ? { current: record.fleetCode, sighra: plate }
    : undefined;
  const changes: JourneyPreview["changes"] = {};
  if (!record.entryTime) changes.entry_time = entry;
  if (exit && !record.exitTime) changes.exit_time = exit;
  if (plate && !record.fleetCode) changes.fleet_code = plate;
  return { record, resolution, conflicts, preservedPlate, changes,
    canApply: conflicts.length === 0 && Object.keys(changes).length > 0 };
}
