import { DispatchRowModel } from "@/types/domain";
import { addCalendarDays } from "@/lib/dates/operational-date";
import { usesWorkingContinuity } from "./continuity";

export type JourneyCloseRisk = "neutral" | "closed" | "safe" | "warning" | "urgent" | "overdue";

interface ShiftCloseRule {
  shiftHour: 4 | 12 | 20;
  deadlineTime: string;
  dayOffset: 0 | 1;
}

export interface JourneyCloseAssessment extends ShiftCloseRule {
  deadlineDate: string;
  deadlineTimestamp: number;
  dayLabel: "Hoje" | "Amanhã";
  minutesRemaining: number;
  risk: JourneyCloseRisk;
  isOpenJourney: boolean;
}

const SHIFT_RULES: Record<4 | 12 | 20, ShiftCloseRule> = {
  4: { shiftHour: 4, deadlineTime: "20:49", dayOffset: 0 },
  12: { shiftHour: 12, deadlineTime: "04:49", dayOffset: 1 },
  20: { shiftHour: 20, deadlineTime: "12:49", dayOffset: 1 },
};

function resolveShiftHour(startTime?: string | null, shift?: string | null): 4 | 12 | 20 | null {
  const parsedHour = Number.parseInt((startTime || "").slice(0, 2), 10);
  if (parsedHour === 4 || parsedHour === 12 || parsedHour === 20) return parsedHour;

  const normalizedShift = (shift || "").trim().toUpperCase();
  if (normalizedShift === "A" || normalizedShift === "04" || normalizedShift === "04H") return 4;
  if (normalizedShift === "B" || normalizedShift === "12" || normalizedShift === "12H") return 12;
  if (normalizedShift === "C" || normalizedShift === "20" || normalizedShift === "20H") return 20;
  return null;
}

export function journeyCloseRule(row: DispatchRowModel): ShiftCloseRule | null {
  const shiftHour = resolveShiftHour(row.driver.default_start_time, row.driver.default_shift);
  return shiftHour ? SHIFT_RULES[shiftHour] : null;
}

export function assessJourneyClose(
  row: DispatchRowModel,
  operationalDate: string,
  referenceTimestamp = Date.now()
): JourneyCloseAssessment | null {
  const rule = journeyCloseRule(row);
  if (!rule || !/^\d{4}-\d{2}-\d{2}$/.test(operationalDate)) return null;

  const deadlineDate = addCalendarDays(operationalDate, rule.dayOffset);
  // O horário informado inclui o minuto inteiro: 20:49 continua válido até
  // 20:49:59. O corte técnico acontece na virada para 20:50.
  const deadlineTimestamp = Date.parse(`${deadlineDate}T${rule.deadlineTime}:00-03:00`) + 60_000;
  if (!Number.isFinite(deadlineTimestamp)) return null;

  const minutesRemaining = Math.ceil((deadlineTimestamp - referenceTimestamp) / 60_000);
  const isOpenJourney = Boolean(
    row.entry_time && !row.exit_time && usesWorkingContinuity(row.dispatch_status)
  );
  let risk: JourneyCloseRisk = "neutral";

  if (row.exit_time) risk = "closed";
  else if (isOpenJourney && minutesRemaining <= 0) risk = "overdue";
  else if (isOpenJourney && minutesRemaining <= 60) risk = "urgent";
  else if (isOpenJourney && minutesRemaining <= 120) risk = "warning";
  else if (isOpenJourney) risk = "safe";

  return {
    ...rule,
    deadlineDate,
    deadlineTimestamp,
    dayLabel: rule.dayOffset === 0 ? "Hoje" : "Amanhã",
    minutesRemaining,
    risk,
    isOpenJourney,
  };
}

export function formatMinutesUntilDeadline(minutes: number): string {
  if (minutes <= 0) {
    const overdue = Math.abs(minutes);
    const hours = Math.floor(overdue / 60);
    const remainder = overdue % 60;
    return hours ? `${hours}h${String(remainder).padStart(2, "0")} atrasado` : `${remainder} min atrasado`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `faltam ${hours}h${String(remainder).padStart(2, "0")}` : `faltam ${remainder} min`;
}
