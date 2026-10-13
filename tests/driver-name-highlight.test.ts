import assert from "node:assert/strict";
import test from "node:test";
import { getDriverNameHighlightClass } from "../src/lib/dispatch/driver-name-highlight";

test("VF destaca o nome em azul somente fora de Castilho", () => {
  assert.equal(getDriverNameHighlightClass("VF", "LP"), "excel-driver-vf");
  assert.equal(getDriverNameHighlightClass(" vf ", "CASTILHO"), "excel-driver-castilho");
});

test("Castilho mantém seu destaque e os demais condutores não recebem cor especial", () => {
  assert.equal(getDriverNameHighlightClass("1", " castilho "), "excel-driver-castilho");
  assert.equal(getDriverNameHighlightClass("1", "LP"), "");
  assert.equal(getDriverNameHighlightClass("F", "LP"), "");
});
