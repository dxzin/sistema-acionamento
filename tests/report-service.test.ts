import assert from "node:assert/strict";
import test from "node:test";
import { aggregateOperationalReport } from "../src/lib/services/report-service";

test("consolida status, jornadas e destinos sem contar linhas vazias como acionamento", () => {
  const drivers = new Map([
    ["d1", { name: "Ana", login_matricula: "100" }],
    ["d2", { name: "Bruno", login_matricula: "200" }],
  ]);
  const locations = new Map([["lp", "LP"], ["qua", "QUATÁ"]]);

  const report = aggregateOperationalReport([
    {
      driver_id: "d1", dispatch_status: "ACIONADO", entry_time: "04:00:00", exit_time: "12:00:00",
      total_worked_minutes: null, destination_location_id: "lp", final_destination_location_id: "qua",
    },
    {
      driver_id: "d1", dispatch_status: " apoio ", entry_time: "20:00:00", exit_time: "08:00:00",
      total_worked_minutes: null, destination_location_id: "lp", final_destination_location_id: null,
    },
    {
      driver_id: "d2", dispatch_status: "", entry_time: null, exit_time: null,
      total_worked_minutes: null, destination_location_id: null, final_destination_location_id: null,
    },
    {
      driver_id: "d2", dispatch_status: "ABONADO", entry_time: null, exit_time: null,
      total_worked_minutes: null, destination_location_id: null, final_destination_location_id: null,
      scale_day_status: "F",
    },
  ], drivers, locations, 2);

  assert.equal(report.sheetCount, 2);
  assert.equal(report.totalRows, 3);
  assert.equal(report.filledStatuses, 2);
  assert.equal(report.completedJourneys, 2);
  assert.equal(report.averageWorkedMinutes, 600);
  assert.equal(report.longJourneys, 1);
  assert.deepEqual(report.statuses.map(({ status, count }) => ({ status, count })), [
    { status: "ACIONADO", count: 1 },
    { status: "APOIO", count: 1 },
    { status: "SEM STATUS", count: 1 },
  ]);
  assert.deepEqual(report.destinations, [{ name: "LP", count: 1 }, { name: "QUATÁ", count: 1 }]);
  assert.equal(report.drivers[0].driver, "Ana");
  assert.equal(report.drivers[0].dispatches, 2);
});

test("retorna relatório vazio para período sem folhas", () => {
  const report = aggregateOperationalReport([], new Map(), new Map(), 0);
  assert.equal(report.totalRows, 0);
  assert.equal(report.averageWorkedMinutes, null);
  assert.deepEqual(report.statuses, []);
  assert.deepEqual(report.drivers, []);
});
