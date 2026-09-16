import assert from "node:assert/strict";
import test from "node:test";
import { canCreateDailySheet, currentDateInBrasilia, nextOperationalDate } from "../src/lib/dates/operational-date";

const lateOnDay10InBrasilia = new Date("2026-09-11T02:30:00Z");

test("considera o calendário de Brasília ao calcular o dia operacional", () => {
  assert.equal(currentDateInBrasilia(lateOnDay10InBrasilia), "2026-09-10");
  assert.equal(nextOperationalDate(lateOnDay10InBrasilia), "2026-09-11");
});

test("permite criar a folha de hoje ou do dia seguinte", () => {
  assert.equal(canCreateDailySheet("2026-09-11", lateOnDay10InBrasilia), true);
  assert.equal(canCreateDailySheet("2026-09-10", lateOnDay10InBrasilia), true);
  assert.equal(canCreateDailySheet("2026-09-09", lateOnDay10InBrasilia), false);
  assert.equal(canCreateDailySheet("2026-09-12", lateOnDay10InBrasilia), false);
});
