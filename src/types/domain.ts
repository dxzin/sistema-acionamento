import { Base, Dispatch, Driver, Location, Vehicle } from "./database";

export interface DispatchRowModel extends Dispatch {
  driver: Driver;
  base?: Base;
  vehicle?: Vehicle;
  fleet_code?: string;
  origin_location?: Location;
  destination_location?: Location;
  final_destination_location?: Location;
  destination_name?: string;
  final_destination_name?: string;
  // Computed display helper fields
  formatted_worked_time?: string;
  is_overnight?: boolean;
  is_ongoing?: boolean;
}

export interface DispatchFilterOptions {
  searchQuery: string;
  statusFilter: string;
  baseFilter: string;
  shiftFilter: string;
  date: string;
  region: "SP" | "UBJP" | "ALL";
}

export interface DispatchSummaryKPIs {
  total: number;
  acionados: number;
  abonados: number;
  apoios: number;
  trocas: number;
  faltas: number;
  emAndamento: number;
  pendentesAbono: number;
}
