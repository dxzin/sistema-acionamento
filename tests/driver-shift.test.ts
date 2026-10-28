import assert from "node:assert/strict";
import test from "node:test";
import { getDemoDrivers, updateDriverShift, updateDriverScheduleTime, updateDriver } from "../src/lib/services/driver-service";
import { loadMonthlySchedule } from "../src/lib/services/schedule-service";

test("editar o turno da escala atualiza o cadastro compartilhado sem sobrescrever horário e demais campos", async () => {
  const stored = new Map<string, string>();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  } } });
  try {
    const catalog = await loadMonthlySchedule(9, 2026, "SP");
    assert.ok(catalog.drivers.every((item) => ["LP", "CASTILHO"].includes(item.base_code)));
    const driver = catalog.drivers[0];
    assert.ok(driver);
    const shift = driver.default_shift === "A" ? "C" : "A";
    const updated = await updateDriverShift(driver.id, shift, "demo");
    assert.equal(updated.default_shift, shift);
    assert.equal(updated.default_start_time, driver.default_start_time);
    assert.equal(updated.name, driver.name);
    assert.equal(getDemoDrivers().find((item) => item.id === driver.id)?.default_shift, shift);
    const timeUpdated = await updateDriverScheduleTime(driver.id, "07:30", "demo");
    assert.equal(timeUpdated.default_start_time, "07:30:00");
    assert.equal(timeUpdated.default_shift, shift);
    assert.equal(getDemoDrivers().find((item) => item.id === driver.id)?.default_start_time, "07:30:00");
    assert.equal((await loadMonthlySchedule(9, 2026, "SP")).drivers.find((item) => item.id === driver.id)?.default_start_time, "07:30:00");
    await updateDriver(driver.id, {
      name: driver.name, login_matricula: driver.login_matricula, base_id: driver.base_id,
      default_shift: shift, default_start_time: "09:00:00", is_closed_trip: true, is_active: driver.is_active,
    }, "demo");
    assert.equal((await loadMonthlySchedule(9, 2026, "SP")).drivers.find((item) => item.id === driver.id)?.default_start_time, "09:00:00");
    assert.equal(getDemoDrivers().find((item) => item.id === driver.id)?.is_closed_trip, true);
    await assert.rejects(updateDriverScheduleTime(driver.id, "25:30", "demo"), /Horário inválido/);
    assert.equal((await loadMonthlySchedule(9, 2026, "SP")).drivers.find((item) => item.id === driver.id)?.default_shift, shift);
    for (const letter of ["A", "B", "C", "D", "E", "F", "G"]) {
      const changed = await updateDriverShift(driver.id, letter, "demo");
      assert.equal(changed.default_shift, letter);
      assert.equal(changed.default_start_time, "09:00:00");
      assert.equal((await loadMonthlySchedule(9, 2026, "SP")).drivers.find((item) => item.id === driver.id)?.default_shift, letter);
    }
    await assert.rejects(updateDriverShift(driver.id, "H", "demo"), /escala de A a G/);
    assert.equal(getDemoDrivers().find((item) => item.id === driver.id)?.default_shift, "G");
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
