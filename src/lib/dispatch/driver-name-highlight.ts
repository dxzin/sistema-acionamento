export function getDriverNameHighlightClass(
  scaleDayStatus?: string | null,
  baseCode?: string | null,
  isClosedTrip = false,
): "excel-driver-vf" | "excel-driver-castilho" | "" {
  if (baseCode?.trim().toUpperCase() === "CASTILHO") return "excel-driver-castilho";
  const scaleCode = scaleDayStatus?.trim().toUpperCase() || "";
  const isDayOff = ["F", "FE", "AF", "DES", "DESL"].includes(scaleCode);
  if (scaleCode === "VF" || (isClosedTrip && Boolean(scaleCode) && !isDayOff)) return "excel-driver-vf";
  return "";
}
