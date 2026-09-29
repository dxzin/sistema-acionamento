const ALLOWED_SHORT_LOCATION_CODES = new Set(["JP", "LP", "LZ", "MS", "SP", "UB"]);

const OPERATIONAL_VALUES = new Set([
  "/C",
  "ABONADO",
  "ACIONADO",
  "ACIONAR",
  "APOIO",
  "C",
  "C/V",
  "DESTINO",
  "DESTINO FINAL",
  "ESTOURO DE JORNADA",
  "INSERIR LOCAL",
  "SUSPENSO",
  "V",
  "V/C",
]);

const TIME_PATTERN = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const NUMBER_PATTERN = /^\d+(?:[.,]\d+)?$/;
const VEHICLE_PLATE_PATTERN = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;

export function normalizeLocationName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 100);
}

export function isValidLocationName(value: string): boolean {
  const name = normalizeLocationName(value);
  if (!name) return false;
  if (ALLOWED_SHORT_LOCATION_CODES.has(name)) return true;
  if (name.length < 3) return false;
  if (TIME_PATTERN.test(name) || NUMBER_PATTERN.test(name) || VEHICLE_PLATE_PATTERN.test(name)) return false;
  return !OPERATIONAL_VALUES.has(name);
}

export const INVALID_LOCATION_MESSAGE =
  "Informe um local válido. Horários, placas, logins, status e textos da planilha não podem ser cadastrados como destino.";
