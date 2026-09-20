import React from "react";
import type { DispatchRowModel } from "../../src/types/domain";
import type { DispatchFilterOptions } from "../../src/types/domain";

let rows = [{ id: "joao", driver_id: "joao", daily_sheet_id: "local-sheet", dispatch_status: "",
  observations: "original", updated_at: "2026-09-19T10:00:00Z",
  driver: { id: "joao", name: "JOÃO", login_matricula: "1", default_start_time: "04:00:00" },
  base: { id: "base-ub", code: "UB", name: "UB" },
}, { id: "gabriel", driver_id: "gabriel", daily_sheet_id: "local-sheet", dispatch_status: "",
  observations: "original", updated_at: "2026-09-19T10:00:00Z",
  driver: { id: "gabriel", name: "GABRIEL", login_matricula: "2", default_start_time: "12:00:00" },
  base: { id: "base-lz", code: "LZ", name: "LZ" },
}] as DispatchRowModel[];
let token = 1;
let holdRead = false;
let releaseRead: (() => void) | undefined;
const writes: unknown[] = [];
Object.assign(window, { pageFixture: {
  deferRead: () => { holdRead = true; token++; },
  readIsWaiting: () => Boolean(releaseRead),
  releaseRead: () => { releaseRead?.(); releaseRead = undefined; },
  writes: () => writes,
} });

export const dispatchService = {
  getDispatchesForSheet: async () => {
    const snapshot = structuredClone(rows);
    if (holdRead) {
      holdRead = false;
      await new Promise<void>(resolve => { releaseRead = resolve; });
    }
    return snapshot;
  },
  getLocations: async () => [],
  getDailySheet: async () => ({ id: "local-sheet", status: "OPEN" }),
  getDailySheetSyncToken: async () => String(token),
  touchAndGetOperatorPresence: async () => [],
  clearOperatorPresence: async () => undefined,
  updateDispatchBatch: async (updates: { id: string; changes: Partial<DispatchRowModel> }[]) => {
    writes.push(...structuredClone(updates));
    rows = rows.map(row => {
      const update = updates.find(item => item.id === row.id);
      return update ? { ...row, ...update.changes, updated_at: `2026-09-19T11:${String(++token).padStart(2, "0")}:00Z` } : row;
    });
    return rows.filter(row => updates.some(item => item.id === row.id));
  },
};
const user = { id: "local-user", name: "Teste local", email: "local@example.test", role: "operator" };
const params = new URLSearchParams();
const router = { replace: () => undefined, push: () => undefined };
export const useAuth = () => ({ user });
export const useRouter = () => router;
export const useSearchParams = () => params;
export const Header = () => null;
export const Sidebar = () => null;
export function DispatchFilters({ onRefresh, onFilterChange }: {
  onRefresh: () => void; onFilterChange: (filters: Partial<DispatchFilterOptions>) => void;
}) {
  Object.assign(window, { filterPageToGabriel: () => onFilterChange({ searchQuery: "GABRIEL" }) });
  return <button onClick={onRefresh}>Atualizar</button>;
}
