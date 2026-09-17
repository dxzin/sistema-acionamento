export type SighraMacro = { login: string; name: string; gps_at: string; inserted_at: string | null; vehicle: string | null };
export type SighraResult = { macros: SighraMacro[]; last_end: SighraMacro | null };
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
  if (Object.keys(body).some(key => !["macros", "last_end"].includes(key)) || !Array.isArray(body.macros) || body.macros.length > 10) throw new Error("Resultado inválido.");
  const macro = (item: unknown): SighraMacro => {
    if (!item || typeof item !== "object") throw new Error("Macro inválida.");
    const row = item as Record<string, unknown>;
    if (Object.keys(row).some(key => !["login", "name", "gps_at", "inserted_at", "vehicle"].includes(key)) ||
      !validLogin(row.login) || row.login.replace(/^0+(?=\d)/, "") !== login.replace(/^0+(?=\d)/, "") ||
      typeof row.name !== "string" || !row.name.trim() || row.name.length > 180 || !timestamp(row.gps_at) ||
      !(row.inserted_at === null || timestamp(row.inserted_at)) || !(row.vehicle === null || validLogin(row.vehicle))) throw new Error("Macro inválida.");
    return { login: row.login, name: row.name.trim(), gps_at: row.gps_at, inserted_at: row.inserted_at, vehicle: row.vehicle };
  };
  const macros = body.macros.map(macro).sort((a, b) => b.gps_at.localeCompare(a.gps_at));
  const last_end = body.last_end === null ? null : macro(body.last_end);
  if (last_end && (!END_MACROS.has(last_end.name) || last_end.gps_at.slice(0, 10) < since)) throw new Error("Fim de jornada inválido.");
  return { macros, last_end };
}
export function exitTime(macro: SighraMacro) { return `${macro.gps_at.slice(11, 16)}:00`; }
export function jobView(job: { id: string; login: string; status: string; expires_at: string; created_at: string; since_date: string; result: SighraResult | null; error: string | null }) {
  const expired = ["queued", "running"].includes(job.status) && Date.parse(job.expires_at) <= Date.now();
  return { id: job.id, login: job.login, status: expired ? "expired" : job.status,
    created_at: job.created_at, since_date: job.since_date, result: job.result,
    error: expired ? "A ponte não respondeu a tempo. Confira a VPN e tente novamente." : job.error };
}
