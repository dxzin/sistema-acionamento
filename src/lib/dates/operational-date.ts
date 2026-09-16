export function currentDateInBrasilia(referenceDate = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(referenceDate);
}

export function addCalendarDays(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function nextOperationalDate(referenceDate = new Date()) {
  return addCalendarDays(currentDateInBrasilia(referenceDate), 1);
}

export function canCreateDailySheet(targetDate: string, referenceDate = new Date()) {
  const currentDate = currentDateInBrasilia(referenceDate);
  return targetDate === currentDate || targetDate === addCalendarDays(currentDate, 1);
}
