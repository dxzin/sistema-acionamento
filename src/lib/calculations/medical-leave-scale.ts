type ScheduleDay = { day_of_month: number; scale_code: string };

export function isMedicalLeaveScaleCode(code: string | null | undefined): boolean {
  return ["AT", "ATES"].includes((code || "").trim().toUpperCase());
}

export function reconcileMedicalLeaveDispatchStatus(
  scaleCode: string | null | undefined,
  currentStatus: string | null | undefined,
): string | null {
  if (isMedicalLeaveScaleCode(scaleCode)) {
    return currentStatus === "ATESTADO" ? null : "ATESTADO";
  }
  return currentStatus === "ATESTADO" ? "" : null;
}

export function resolveMedicalLeaveScaleDay(
  day: number,
  entries: ScheduleDay[],
  baseCode: string | null | undefined,
): string | null {
  const codes = entries.map((entry) => Number(entry.scale_code.trim()));
  const workDays = baseCode === "LZ" || baseCode === "MS" || codes.some((code) => code === 5 || code === 6) ? 6 : 4;
  const restDays = workDays === 6 ? 3 : 2;
  const anchors = entries.filter((entry) => {
    const code = Number(entry.scale_code.trim());
    return Number.isInteger(code) && code >= 1 && code <= workDays;
  });
  if (!anchors.length) return null;

  const earlier = anchors.filter((entry) => entry.day_of_month <= day);
  const anchor = earlier.length
    ? earlier.reduce((latest, entry) => entry.day_of_month > latest.day_of_month ? entry : latest)
    : anchors.reduce((earliest, entry) => entry.day_of_month < earliest.day_of_month ? entry : earliest);
  const cycleLength = workDays + restDays;
  const phase = ((Number(anchor.scale_code.trim()) - 1 + day - anchor.day_of_month) % cycleLength + cycleLength) % cycleLength;
  return phase < workDays ? String(phase + 1) : "F";
}
