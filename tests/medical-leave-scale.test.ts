import assert from "node:assert/strict";
import test from "node:test";
import { isMedicalLeaveScaleCode, resolveMedicalLeaveScaleDay } from "../src/lib/calculations/medical-leave-scale";

test("ATES e AT indicam atestado sem excluir o condutor da sequência", () => {
  assert.equal(isMedicalLeaveScaleCode(" ates "), true);
  assert.equal(isMedicalLeaveScaleCode("AT"), true);
  assert.equal(isMedicalLeaveScaleCode("AF"), false);
});

test("mantém o ciclo 4x2 durante dias marcados ATES", () => {
  const entries = [
    { day_of_month: 1, scale_code: "3" },
    { day_of_month: 2, scale_code: "4" },
    ...[3, 4, 5, 6].map((day) => ({ day_of_month: day, scale_code: "ATES" })),
    { day_of_month: 7, scale_code: "3" },
  ];
  assert.deepEqual([3, 4, 5, 6].map((day) => resolveMedicalLeaveScaleDay(day, entries, "UB")), ["F", "F", "1", "2"]);
});

test("usa um dia futuro para recuperar o ciclo 6x3 no início do mês", () => {
  const entries = [
    ...[1, 2, 3, 4, 5, 6, 7].map((day) => ({ day_of_month: day, scale_code: "ATES" })),
    { day_of_month: 8, scale_code: "3" },
  ];
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((day) => resolveMedicalLeaveScaleDay(day, entries, "LZ")),
    ["5", "6", "F", "F", "F", "1", "2"]);
});

test("sem outro dia numerado não inventa a posição do ciclo", () => {
  assert.equal(resolveMedicalLeaveScaleDay(2, [{ day_of_month: 2, scale_code: "ATES" }], "UB"), null);
});

test("continua o ciclo usando o último dia numerado do mês anterior", () => {
  const entries = [{ day_of_month: 0, scale_code: "4" }, { day_of_month: 1, scale_code: "ATES" }];
  assert.equal(resolveMedicalLeaveScaleDay(1, entries, "UB"), "F");
});

test("recupera o ciclo pelo primeiro dia numerado do mês seguinte", () => {
  const entries = [{ day_of_month: 30, scale_code: "ATES" }, { day_of_month: 31, scale_code: "2" }];
  assert.equal(resolveMedicalLeaveScaleDay(30, entries, "UB"), "1");
});
