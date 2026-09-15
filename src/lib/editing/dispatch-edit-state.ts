import { DispatchRowModel } from "@/types/domain";

export type DispatchEditStatus = "pending" | "saving" | "error";

export interface PendingDispatchField {
  value: unknown;
  version: number;
  status: DispatchEditStatus;
  error?: string;
}

export interface PendingDispatchRow {
  expectedUpdatedAt?: string;
  fields: Partial<Record<keyof DispatchRowModel, PendingDispatchField>>;
}

export type PendingDispatchEdits = Record<string, PendingDispatchRow>;

export interface DispatchSaveSnapshot {
  id: string;
  changes: Partial<DispatchRowModel>;
  versions: Partial<Record<keyof DispatchRowModel, number>>;
  expectedUpdatedAt?: string;
}

export function stageDispatchChanges(
  current: PendingDispatchEdits,
  rowId: string,
  changes: Partial<DispatchRowModel>,
  expectedUpdatedAt: string | undefined,
  nextVersion: () => number
): PendingDispatchEdits {
  const previousRow = current[rowId];
  const fields = { ...(previousRow?.fields || {}) };
  for (const [rawKey, value] of Object.entries(changes)) {
    const key = rawKey as keyof DispatchRowModel;
    fields[key] = { value, version: nextVersion(), status: "pending" };
  }
  return {
    ...current,
    [rowId]: {
      expectedUpdatedAt: previousRow?.expectedUpdatedAt ?? expectedUpdatedAt,
      fields,
    },
  };
}

export function createDispatchSaveSnapshot(edits: PendingDispatchEdits): DispatchSaveSnapshot[] {
  return Object.entries(edits).flatMap(([id, row]) => {
    const changes: Partial<DispatchRowModel> = {};
    const versions: Partial<Record<keyof DispatchRowModel, number>> = {};
    for (const [rawKey, field] of Object.entries(row.fields)) {
      if (!field || field.status === "saving") continue;
      const key = rawKey as keyof DispatchRowModel;
      (changes as Record<string, unknown>)[key] = field.value;
      versions[key] = field.version;
    }
    return Object.keys(changes).length
      ? [{ id, changes, versions, expectedUpdatedAt: row.expectedUpdatedAt }]
      : [];
  });
}

export function markDispatchSnapshotSaving(
  edits: PendingDispatchEdits,
  snapshot: DispatchSaveSnapshot[]
): PendingDispatchEdits {
  const next = { ...edits };
  for (const item of snapshot) {
    const row = next[item.id];
    if (!row) continue;
    const fields = { ...row.fields };
    for (const [rawKey, version] of Object.entries(item.versions)) {
      const key = rawKey as keyof DispatchRowModel;
      const field = fields[key];
      if (field && field.version === version) fields[key] = { ...field, status: "saving", error: undefined };
    }
    next[item.id] = { ...row, fields };
  }
  return next;
}

export function resolveDispatchSnapshotSuccess(
  edits: PendingDispatchEdits,
  snapshot: DispatchSaveSnapshot[],
  savedRows: Pick<DispatchRowModel, "id" | "updated_at">[]
): PendingDispatchEdits {
  const next = { ...edits };
  const savedById = new Map(savedRows.map((row) => [row.id, row]));
  for (const item of snapshot) {
    const row = next[item.id];
    const saved = savedById.get(item.id);
    if (!row || !saved) continue;
    const fields = { ...row.fields };
    for (const [rawKey, version] of Object.entries(item.versions)) {
      const key = rawKey as keyof DispatchRowModel;
      if (fields[key]?.version === version) delete fields[key];
    }
    if (Object.keys(fields).length) {
      next[item.id] = { expectedUpdatedAt: saved.updated_at, fields };
    } else {
      delete next[item.id];
    }
  }
  return next;
}

export function resolveDispatchSnapshotFailure(
  edits: PendingDispatchEdits,
  snapshot: DispatchSaveSnapshot[],
  message: string
): PendingDispatchEdits {
  const next = { ...edits };
  for (const item of snapshot) {
    const row = next[item.id];
    if (!row) continue;
    const fields = { ...row.fields };
    for (const [rawKey, version] of Object.entries(item.versions)) {
      const key = rawKey as keyof DispatchRowModel;
      const field = fields[key];
      if (field?.version === version) fields[key] = { ...field, status: "error", error: message };
    }
    next[item.id] = { ...row, fields };
  }
  return next;
}

export function mergeServerDispatches(
  serverRows: DispatchRowModel[],
  localRows: DispatchRowModel[],
  edits: PendingDispatchEdits
): DispatchRowModel[] {
  const merged = serverRows.map((serverRow) => {
    const pending = edits[serverRow.id];
    if (!pending) return serverRow;
    const changes = Object.fromEntries(
      Object.entries(pending.fields).map(([key, field]) => [key, field?.value])
    ) as Partial<DispatchRowModel>;
    return { ...serverRow, ...changes, updated_at: serverRow.updated_at };
  });
  const serverIds = new Set(serverRows.map((row) => row.id));
  return [
    ...merged,
    ...localRows.filter((row) => edits[row.id] && !serverIds.has(row.id)),
  ];
}

export function hasPendingDispatchEdits(edits: PendingDispatchEdits): boolean {
  return Object.keys(edits).length > 0;
}
