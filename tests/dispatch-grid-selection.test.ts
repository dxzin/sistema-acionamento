import test from "node:test";
import assert from "node:assert/strict";
import { captureGridSelection, gridSelectionBounds, resolveGridSelectionRows } from "../src/lib/editing/dispatch-grid-selection";

test("seleção preserva IDs e ordem de colagem com reordenação e novos condutores", () => {
  const rows = [{ id: "joao" }, { id: "gabriel" }];
  const selection = captureGridSelection(rows, { rowId: "joao", column: 3 }, { rowId: "gabriel", column: 4 });
  const refreshed = [{ id: "novo" }, rows[1], rows[0]];
  assert.deepEqual(resolveGridSelectionRows(selection, refreshed), rows);
  assert.deepEqual(gridSelectionBounds(selection), { top: 0, bottom: 1, left: 3, right: 4 });
});

test("registro removido ou filtrado deixa lacuna sem deslocar destinatários", () => {
  const rows = [{ id: "joao" }, { id: "gabriel" }];
  const selection = captureGridSelection(rows, { rowId: "joao", column: 3 });
  assert.deepEqual(resolveGridSelectionRows(selection, [rows[1], { id: "novo" }]), [undefined, rows[1]]);
});

test("seleção invertida mantém limites associados aos IDs originais", () => {
  const selection = captureGridSelection([{ id: "joao" }, { id: "gabriel" }],
    { rowId: "gabriel", column: 13 }, { rowId: "joao", column: 7 });
  assert.deepEqual(gridSelectionBounds(selection), { top: 0, bottom: 1, left: 7, right: 13 });
});
