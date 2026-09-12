export type UserRole = "admin" | "supervisor" | "operator";

// Os valores usuais são sugeridos na interface, mas o operador também pode
// registrar livremente uma situação nova na folha diária.
export type DispatchStatus = string;

// C e V continuam sendo os valores usuais, mas o operador pode registrar
// livremente outra indicação na folha diária.
export type CargoStatus = string;
export type SheetStatus = "OPEN" | "LOCKED" | "CLOSED";

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  base_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Base {
  id: string;
  code: string;
  name: string;
  interjornada_minutes: number;
  is_active: boolean;
  created_at: string;
}

export interface Driver {
  id: string;
  name: string;
  login_matricula: string;
  base_id: string;
  default_shift?: string;
  default_start_time?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  plate_code: string;
  vehicle_type: string;
  is_active: boolean;
  created_at: string;
}

export interface Location {
  id: string;
  name: string;
  region?: string;
  is_active: boolean;
  created_at: string;
}

export interface MonthlySchedule {
  id: string;
  month: number;
  year: number;
  region: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MonthlyScheduleEntry {
  id: string;
  schedule_id: string;
  driver_id: string;
  day_of_month: number;
  scale_code: string;
  shift_letter?: string;
  shift_time?: string;
  notes?: string;
  updated_at: string;
}

export interface DailySheet {
  id: string;
  date: string; // YYYY-MM-DD
  region: string; // 'SP' | 'UBJP'
  status: SheetStatus;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface OperatorPresence {
  user_id: string;
  display_name: string;
  email: string;
  active_dispatch_id?: string | null;
  last_seen: string;
}

export interface Dispatch {
  id: string;
  daily_sheet_id: string;
  driver_id: string;
  previous_dispatch_id?: string | null;
  forecast_start_time?: string | null; // HH:mm:ss
  forecast_source?: "SCHEDULE" | "CONTINUITY" | "MANUAL";
  dispatch_status: DispatchStatus;
  abono_reason?: string | null;
  abono_authorized_by?: string | null;
  origin_location_id?: string | null;
  origin_source?: "SCHEDULE" | "CONTINUITY" | "BASE" | "MANUAL";
  entry_time?: string | null; // HH:mm:ss
  vehicle_id?: string | null;
  cargo_status?: CargoStatus | null;
  destination_location_id?: string | null;
  final_destination_location_id?: string | null;
  exit_time?: string | null; // HH:mm:ss
  observations?: string | null;
  scale_day_status?: string | null;
  next_day_forecast_time?: string | null;
  total_worked_minutes?: number | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string | null;
  entity_name: string;
  entity_id: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  timestamp: string;
}
