import assert from "node:assert/strict";
import test from "node:test";
import { escapeCsvCell } from "../src/lib/exports/csv";

test("escapa aspas em células CSV", () => {
  assert.equal(escapeCsvCell('Condutor "A"'), '"Condutor ""A"""');
});

test("neutraliza fórmulas de planilha em células CSV", () => {
  assert.equal(escapeCsvCell("=HYPERLINK(\"https://example.invalid\")"), '"\'=HYPERLINK(""https://example.invalid"")"');
  assert.equal(escapeCsvCell("  +1+1"), '"\'  +1+1"');
  assert.equal(escapeCsvCell("@SUM(1,1)"), '"\'@SUM(1,1)"');
});

test("preserva texto operacional comum", () => {
  assert.equal(escapeCsvCell("ALTERAÇÃO"), '"ALTERAÇÃO"');
});
