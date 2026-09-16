import { createHash, timingSafeEqual } from "node:crypto";
import { currentDateInBrasilia, addCalendarDays } from "../dates/operational-date";

export function validDashboardToken(header: string | null, secret: string) {
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!secret || !token) return false;
  return timingSafeEqual(createHash("sha256").update(token).digest(), createHash("sha256").update(secret).digest());
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 2000 &&
    Number(value.slice(0, 4)) <= 2100 && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function parseDashboardFilters(params: URLSearchParams) {
  const allowed = new Set(["data", "inicio", "fim", "matricula", "base", "pagina", "limite"]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw new Error(`Parâmetro inválido: ${key}.`);
  }
  if (params.has("data") && (params.has("inicio") || params.has("fim"))) throw new Error("Use data ou inicio/fim.");
  if (params.has("inicio") !== params.has("fim")) throw new Error("Informe inicio e fim juntos.");
  const inicio = params.get("data") ?? params.get("inicio") ?? currentDateInBrasilia();
  const fim = params.get("data") ?? params.get("fim") ?? inicio;
  if (!validDate(inicio) || !validDate(fim) || fim < inicio || fim > addCalendarDays(inicio, 30)) {
    throw new Error("Período inválido. Use YYYY-MM-DD, com até 31 dias.");
  }
  const pagina = params.get("pagina") ?? "1";
  const limite = params.get("limite") ?? "50";
  if (!/^[1-9]\d*$/.test(pagina) || !/^[1-9]\d*$/.test(limite) || Number(pagina) > 100000 || Number(limite) > 100) {
    throw new Error("Pagina deve ser de 1 a 100000 e limite de 1 a 100.");
  }
  const matricula = params.get("matricula")?.trim();
  const base = params.get("base")?.trim().toUpperCase();
  if (matricula !== undefined && (!matricula || matricula.length > 100)) throw new Error("Matrícula inválida.");
  if (base !== undefined && (!base || base.length > 30)) throw new Error("Base inválida.");
  return { inicio, fim, matricula, base, pagina: Number(pagina), limite: Number(limite) };
}

// A previsão é calculada somente quando existem horários reais de entrada e saída.
export function restAvailability(date: string, entry: string | null | undefined, exit: string | null | undefined, restMinutes: number) {
  const clock = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
  if (!entry || !exit || !clock.test(entry) || !clock.test(exit) || !Number.isFinite(restMinutes) || restMinutes < 0) return null;
  const start = new Date(`${date}T${entry.length === 5 ? `${entry}:00` : entry}-03:00`);
  const end = new Date(`${date}T${exit.length === 5 ? `${exit}:00` : exit}-03:00`);
  if (end < start) end.setUTCDate(end.getUTCDate() + 1);
  return new Date(end.getTime() + restMinutes * 60000).toISOString();
}
