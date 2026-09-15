import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDispatchReminderDate,
  DEFAULT_REMINDER_VOLUME,
  dispatchReminderStorageKey,
  dispatchReminderVolumeStorageKey,
  parseDispatchReminders,
  parseDispatchReminderVolume,
  reminderClockTime,
} from "../src/lib/reminders/dispatch-reminders";

test("cria o horário do lembrete na data operacional", () => {
  const result = buildDispatchReminderDate("2026-09-13", "07:30");
  assert.ok(result);
  assert.equal(result.getFullYear(), 2026);
  assert.equal(result.getMonth(), 8);
  assert.equal(result.getDate(), 13);
  assert.equal(result.getHours(), 7);
  assert.equal(result.getMinutes(), 30);
});

test("rejeita data ou horário inválido", () => {
  assert.equal(buildDispatchReminderDate("13/09/2026", "07:30"), null);
  assert.equal(buildDispatchReminderDate("2026-09-13", "24:00"), null);
});

test("ignora conteúdo de sessão inválido e preserva lembretes válidos", () => {
  assert.deepEqual(parseDispatchReminders("não é json"), []);
  assert.deepEqual(parseDispatchReminders(JSON.stringify([{ dispatchId: 3 }])), []);

  const reminder = {
    dispatchId: "dispatch-1",
    driverName: "Condutor A",
    sheetDate: "2026-09-13",
    scheduledAt: "2026-09-13T07:30:00.000Z",
  };
  assert.deepEqual(parseDispatchReminders(JSON.stringify([reminder])), [reminder]);
});

test("isola o armazenamento pelo usuário e formata o relógio", () => {
  assert.equal(dispatchReminderStorageKey("user-1"), "dispatch-reminders:user-1");
  assert.equal(dispatchReminderVolumeStorageKey("user-1"), "dispatch-reminder-volume:user-1");
  const date = new Date(2026, 8, 13, 7, 30);
  assert.equal(reminderClockTime({
    dispatchId: "dispatch-1",
    driverName: "Condutor A",
    sheetDate: "2026-09-13",
    scheduledAt: date.toISOString(),
  }), "07:30");
});

test("normaliza o volume escolhido pelo operador", () => {
  assert.equal(parseDispatchReminderVolume("82"), 82);
  assert.equal(parseDispatchReminderVolume("120"), 100);
  assert.equal(parseDispatchReminderVolume("-5"), 0);
  assert.equal(parseDispatchReminderVolume("inválido"), DEFAULT_REMINDER_VOLUME);
  assert.equal(parseDispatchReminderVolume(null), DEFAULT_REMINDER_VOLUME);
});
