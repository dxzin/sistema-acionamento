import { Base, Driver, Location } from "@/types/database";

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLocaleUpperCase("pt-BR");
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
  return locations.find((location) => {
    const locationName = normalize(location.name);
    return locationName === baseCode || locationName === baseName;
  })?.id || null;
}
