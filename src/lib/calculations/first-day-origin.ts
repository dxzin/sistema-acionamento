import { Base, Driver, Location } from "@/types/database";
import { minutesToTime, timeToMinutes } from "./jornada";

function normalize(value: string | null | undefined) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleUpperCase("pt-BR");
}

export function resolveFirstDayBaseOrigin(
  scaleCode: string | null | undefined,
  currentOriginId: string | null | undefined,
  driver: Driver | undefined,
  bases: Base[],
  locations: Location[]
) {
  if (currentOriginId || normalize(scaleCode) !== "1" || !driver) return null;
  const base = bases.find((item) => item.id === driver.base_id);
  if (!base) return null;

  const baseCode = normalize(base.code);
  const baseName = normalize(base.name);
  const aliases: Record<string, string[]> = {
    UB: ["UBERABA"],
    LZ: ["LUIZLANDIA", "LUIZLANDIA DO OESTE"],
    JP: ["JOAO PINHEIRO"],
    LP: ["LENCOIS PAULISTA"],
  };
  const names = new Set([baseCode, baseName, ...(aliases[baseCode] || [])]);
  return locations.find((location) => {
    if (!location.is_active) return false;
    const locationName = normalize(location.name);
    return names.has(locationName);
  })?.id || null;
}

export function resolveFirstDayForecast(
  scaleCode: string | null | undefined,
  shiftTime: string | null | undefined
) {
  if (normalize(scaleCode) !== "1" || !shiftTime?.trim()) return null;
  return minutesToTime(timeToMinutes(shiftTime) - 240);
}
