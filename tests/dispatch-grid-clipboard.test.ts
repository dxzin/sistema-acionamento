import test from "node:test";
import assert from "node:assert/strict";
import { parseGridClipboard } from "../src/lib/editing/dispatch-grid-clipboard";

test("interpreta bloco do Excel com quebras de linha e aspas dentro de células", () => {
  assert.deepEqual(parseGridClipboard('ANA\t"OBSERVAÇÃO\ncom \"\"aspas\"\""\r\nJOÃO\tDESTINO\r\n'), [
    ["ANA", 'OBSERVAÇÃO\ncom "aspas"'], ["JOÃO", "DESTINO"],
  ]);
});

test("preserva células vazias sem criar linha extra no fim", () => {
  assert.deepEqual(parseGridClipboard("ANA\t\tDESTINO\nJOÃO\t\t\n"), [
    ["ANA", "", "DESTINO"], ["JOÃO", "", ""],
  ]);
  assert.deepEqual(parseGridClipboard(""), []);
});
