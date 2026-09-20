export interface GridCellIdentity {
  rowId: string;
  column: number;
}

export interface DispatchGridSelection {
  anchor: GridCellIdentity;
  focus: GridCellIdentity;
  // Capture the intended records, including paste destinations, when selected.
  // A later array order must never change the recipients of a grid operation.
  rowIds: string[];
}

export function captureGridSelection(
  rows: { id: string }[], anchor: GridCellIdentity, focus = anchor
): DispatchGridSelection {
  return { anchor, focus, rowIds: rows.map(row => row.id) };
}

export function gridSelectionBounds(selection: DispatchGridSelection | null) {
  if (!selection) return null;
  const anchor = selection.rowIds.indexOf(selection.anchor.rowId);
  const focus = selection.rowIds.indexOf(selection.focus.rowId);
  if (anchor < 0 || focus < 0) return null;
  return { top: Math.min(anchor, focus), bottom: Math.max(anchor, focus),
    left: Math.min(selection.anchor.column, selection.focus.column),
    right: Math.max(selection.anchor.column, selection.focus.column) };
}

export function resolveGridSelectionRows<T extends { id: string }>(selection: DispatchGridSelection | null, rows: T[]) {
  const byId = new Map(rows.map(row => [row.id, row]));
  return selection?.rowIds.map(id => byId.get(id)) || [];
}
