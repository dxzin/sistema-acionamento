import { calculateJornada } from "@/lib/calculations/jornada";
import { Dispatch, Location } from "@/types/database";
import { DispatchRowModel } from "@/types/domain";

export function mergeRealtimeDispatchUpdate(
  current: DispatchRowModel,
  incoming: Dispatch,
  locations: Location[]
): DispatchRowModel | null {
  if (incoming.id !== current.id || incoming.driver_id !== current.driver_id) return null;
  if (incoming.vehicle_id !== current.vehicle_id) return null;

  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const resolveLocation = (id: string | null | undefined, currentId: string | null | undefined, currentLocation?: Location) => {
    if (!id) return undefined;
    if (id === currentId && currentLocation) return currentLocation;
    return locationsById.get(id);
  };
  const incomingLocations = [
    [incoming.origin_location_id, current.origin_location_id, current.origin_location],
    [incoming.destination_location_id, current.destination_location_id, current.destination_location],
    [incoming.final_destination_location_id, current.final_destination_location_id, current.final_destination_location],
  ] as const;
  if (incomingLocations.some(([id, currentId, currentLocation]) => id && !resolveLocation(id, currentId, currentLocation))) return null;

  const preserveAutomaticOrigin = !incoming.origin_location_id && incoming.origin_source !== "MANUAL";
  const originId = preserveAutomaticOrigin ? current.origin_location_id : incoming.origin_location_id;
  const originSource = preserveAutomaticOrigin ? current.origin_source : incoming.origin_source;
  const origin = resolveLocation(originId, current.origin_location_id, current.origin_location);
  const destination = resolveLocation(incoming.destination_location_id, current.destination_location_id, current.destination_location);
  const finalDestination = resolveLocation(incoming.final_destination_location_id, current.final_destination_location_id, current.final_destination_location);
  const jornada = calculateJornada(incoming.entry_time, incoming.exit_time);

  return {
    ...current,
    ...incoming,
    origin_location_id: originId,
    origin_source: originSource,
    scale_day_status: current.scale_day_status,
    driver: current.driver,
    base: current.base,
    vehicle: current.vehicle,
    fleet_code: current.fleet_code,
    origin_location: origin,
    origin_name: origin?.name || "",
    destination_location: destination,
    destination_name: destination?.name || "",
    final_destination_location: finalDestination,
    final_destination_name: finalDestination?.name || "",
    formatted_worked_time: jornada.formatted,
    is_overnight: jornada.isOvernight,
    is_ongoing: jornada.isOngoing,
  };
}
