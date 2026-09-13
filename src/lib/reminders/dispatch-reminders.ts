export interface DispatchReminder {
  dispatchId: string;
  driverName: string;
  sheetDate: string;
  scheduledAt: string;
}

export function dispatchReminderStorageKey(userId: string): string {
  return `dispatch-reminders:${userId}`;
}

export function buildDispatchReminderDate(sheetDate: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sheetDate) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return null;
  }

  const scheduledAt = new Date(`${sheetDate}T${time}:00`);
  return Number.isNaN(scheduledAt.getTime()) ? null : scheduledAt;
}

export function reminderClockTime(reminder: DispatchReminder): string {
  const date = new Date(reminder.scheduledAt);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function parseDispatchReminders(raw: string | null): DispatchReminder[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DispatchReminder => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<DispatchReminder>;
      return typeof candidate.dispatchId === "string" &&
        typeof candidate.driverName === "string" &&
        typeof candidate.sheetDate === "string" &&
        typeof candidate.scheduledAt === "string" &&
        !Number.isNaN(new Date(candidate.scheduledAt).getTime());
    });
  } catch {
    return [];
  }
}
