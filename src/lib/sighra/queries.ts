export type SighraMacro = { id?: string; login: string; name: string; gps_at: string; inserted_at: string | null; vehicle: string | null;
  plate?: string | null; point?: string | null; city?: string | null; state?: string | null; street?: string | null;
  latitude?: number | null; longitude?: number | null };
export type SighraResult = { macros: SighraMacro[]; last_end: SighraMacro | null; journey_events?: SighraMacro[] };
export const END_MACROS = new Set(["FIM DE JORNADA", "FIM DE JORNADA GA"]);
export function validLogin(value: unknown): value is string { return typeof value === "string" && /^\d{1,20}$/.test(value); }
export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^20\d{2}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value) && validDate(value.slice(0, 10));
}
export function parseResult(value: unknown, login: string, since: string): SighraResult {
  if (!value || typeof value !== "object") throw new Error("Resultado inválido.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !["macros", "last_end", "journey_events"].includes(key)) || !Array.isArray(body.macros) || body.macros.length > 10 ||
    !(body.journey_events === undefined || (Array.isArray(body.journey_events) && body.journey_events.length <= 40))) throw new Error("Resultado inválido.");
  const macro = (item: unknown): SighraMacro => {
    if (!item || typeof item !== "object") throw new Error("Macro inválida.");
    const row = item as Record<string, unknown>;
    if (Object.keys(row).some(key => !["id", "login", "name", "gps_at", "inserted_at", "vehicle", "plate", "point", "city", "state", "street", "latitude", "longitude"].includes(key)) ||
      !(row.id === undefined || (typeof row.id === "string" && row.id.length > 0 && row.id.length <= 180)) ||
      !validLogin(row.login) || row.login.replace(/^0+(?=\d)/, "") !== login.replace(/^0+(?=\d)/, "") ||
      typeof row.name !== "string" || !row.name.trim() || row.name.length > 180 || !timestamp(row.gps_at) ||
      !(row.inserted_at === null || timestamp(row.inserted_at)) || !(row.vehicle === null || validLogin(row.vehicle))) throw new Error("Macro inválida.");
    const text = (key: string, max: number) => {
      const value = row[key];
      if (value == null) return null;
      if (typeof value !== "string" || value.length > max) throw new Error("Local inválido.");
      return value.trim() || null;
    };
    const coordinate = (key: string, limit: number) => {
      const value = row[key];
      if (value == null) return null;
      if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) throw new Error("Coordenada inválida.");
      return value;
    };
    return { id: row.id, login: row.login, name: row.name.trim(), gps_at: row.gps_at, inserted_at: row.inserted_at, vehicle: row.vehicle,
      plate: text("plate", 255), point: text("point", 255), city: text("city", 255), state: text("state", 2), street: text("street", 255),
      latitude: coordinate("latitude", 90), longitude: coordinate("longitude", 180) };
  };
  const macros = body.macros.map(macro).sort((a, b) => b.gps_at.localeCompare(a.gps_at));
  const last_end = body.last_end === null ? null : macro(body.last_end);
  if (last_end && (!END_MACROS.has(last_end.name) || last_end.gps_at.slice(0, 10) < since)) throw new Error("Fim de jornada inválido.");
  const journey_events = body.journey_events === undefined
    ? undefined
    : body.journey_events.map(macro).sort((a, b) => a.gps_at.localeCompare(b.gps_at));
  if (journey_events?.some(item => item.gps_at.slice(0, 10) < since)) throw new Error("Evento de jornada inválido.");
  return { macros, last_end, journey_events };
}
export function exitTime(macro: SighraMacro) { return `${macro.gps_at.slice(11, 16)}:00`; }
export function macroLocation(macro: SighraMacro) {
  return [macro.point, macro.street, [macro.city, macro.state].filter(Boolean).join(" / ")].filter(Boolean).join(" · ");
}
export function macroMapUrl(macro: SighraMacro) {
  const { latitude, longitude } = macro;
  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) return null;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}
export function jobView(job: { id: string; login: string; status: string; expires_at: string; created_at: string; since_date: string; result: SighraResult | null; error: string | null }) {
  const expired = ["queued", "running"].includes(job.status) && Date.parse(job.expires_at) <= Date.now();
  return { id: job.id, login: job.login, status: expired ? "expired" : job.status,
    created_at: job.created_at, since_date: job.since_date, result: job.result,
    error: expired ? "A ponte não respondeu a tempo. Confira a VPN e tente novamente." : job.error };
}
