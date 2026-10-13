export function getDriverNameHighlightClass(
  scaleDayStatus?: string | null,
  baseCode?: string | null,
): "excel-driver-vf" | "excel-driver-castilho" | "" {
  if (baseCode?.trim().toUpperCase() === "CASTILHO") return "excel-driver-castilho";
  if (scaleDayStatus?.trim().toUpperCase() === "VF") return "excel-driver-vf";
  return "";
}
