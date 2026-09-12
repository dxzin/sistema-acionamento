import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateJornada,
  normalizeClockTime,
  formatMinutesToDuration,
  minutesToTime,
  timeToMinutes,
} from "../src/lib/calculations/jornada";
import { calculateNextForecast } from "../src/lib/calculations/interjornada";

test("converte horário e minutos sem perder a virada do dia", () => {
  assert.equal(timeToMinutes("04:30:00"), 270);
  assert.equal(minutesToTime(1450), "00:10:00");
  assert.equal(minutesToTime(-1), "--:--");
  assert.equal(formatMinutesToDuration(670), "11:10");
});

test("completa os segundos nos horários digitados", () => {
  assert.equal(normalizeClockTime("17:00"), "17:00:00");
  assert.equal(normalizeClockTime("7:05"), "07:05:00");
  assert.equal(normalizeClockTime("17:00:35"), "17:00:35");
});

test("calcula jornada normal", () => {
  assert.deepEqual(calculateJornada("04:00:00", "15:30:00"), {
    minutes: 690,
    formatted: "11:30",
    isOvernight: false,
    isOngoing: false,
  });
});

test("calcula jornada atravessando meia-noite", () => {
  assert.deepEqual(calculateJornada("20:00:00", "05:15:00"), {
    minutes: 555,
    formatted: "09:15",
    isOvernight: true,
    isOngoing: false,
  });
});

test("calcula jornada em andamento com horário de referência", () => {
  assert.deepEqual(calculateJornada("22:00:00", null, "02:30:00"), {
    minutes: 270,
    formatted: "04:30",
    isOvernight: true,
    isOngoing: true,
  });
});

test("mantém jornada vazia sem entrada", () => {
  assert.deepEqual(calculateJornada(null, "10:00:00"), {
    minutes: null,
    formatted: "",
    isOvernight: false,
    isOngoing: false,
  });
});

test("calcula próxima previsão com 11h10 de descanso", () => {
  assert.equal(calculateNextForecast("15:00:00"), "02:10:00");
  assert.equal(calculateNextForecast("23:30:00"), "10:40:00");
  assert.equal(calculateNextForecast(null), null);
});
