import assert from "node:assert/strict";
import test from "node:test";
import { resolvePreviousAbono } from "../src/lib/calculations/continuity";

test("após abono usa turno menos quatro horas e marca abonado ontem", () => {
  for (const [shift, expected] of [["04:00:00", "00:00:00"], ["12:00", "08:00:00"], ["20:00", "16:00:00"], ["02:00", "22:00:00"]]) {
    assert.deepEqual(resolvePreviousAbono({ dispatch_status: " abonado " }, shift), {
      wasAbonado: true, forecastStartTime: expected, abonoReason: "Abonado ontem",
    });
  }
});

test("VF e turno ausente não inventam um horário após abono", () => {
  assert.equal(resolvePreviousAbono({ dispatch_status: "ABONADO" }, "04:00", true).forecastStartTime, null);
  assert.equal(resolvePreviousAbono({ dispatch_status: "ABONADO" }, null).forecastStartTime, null);
  assert.equal(resolvePreviousAbono({ dispatch_status: "ABONADO" }, "VF").forecastStartTime, null);
});

test("sem abono anterior mantém o fluxo normal", () => {
  for (const previous of [null, { dispatch_status: "ACIONADO" }, { dispatch_status: "" }]) {
    assert.deepEqual(resolvePreviousAbono(previous, "04:00"), { wasAbonado: false, forecastStartTime: null, abonoReason: null });
  }
});
