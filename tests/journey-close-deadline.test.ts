import test from "node:test";
import assert from "node:assert/strict";
import { assessJourneyClose, formatMinutesUntilDeadline } from "../src/lib/calculations/journey-close-deadline";
import { DispatchRowModel } from "../src/types/domain";

function row(startTime: string, shift: string, overrides: Partial<DispatchRowModel> = {}): DispatchRowModel {
  return {
    id: crypto.randomUUID(), daily_sheet_id: "sheet", driver_id: "driver", dispatch_status: "ACIONADO",
    entry_time: "04:00:00", created_at: "", updated_at: "",
    driver: {
      id: "driver", name: "Condutor", login_matricula: "1", base_id: "base",
      default_shift: shift, default_start_time: startTime, is_active: true, created_at: "", updated_at: "",
    },
    ...overrides,
  };
}

test("calcula o fechamento máximo dos turnos 04h, 12h e 20h na data correta", () => {
  const reference = Date.parse("2026-10-25T18:00:00-03:00");
  const shift04 = assessJourneyClose(row("04:00:00", "A"), "2026-10-25", reference);
  const shift12 = assessJourneyClose(row("12:00:00", "B"), "2026-10-25", reference);
  const shift20 = assessJourneyClose(row("20:00:00", "C"), "2026-10-25", reference);

  assert.equal(shift04?.deadlineDate, "2026-10-25");
  assert.equal(shift04?.deadlineTime, "20:49");
  assert.equal(shift12?.deadlineDate, "2026-10-26");
  assert.equal(shift12?.deadlineTime, "04:49");
  assert.equal(shift20?.deadlineDate, "2026-10-26");
  assert.equal(shift20?.deadlineTime, "12:49");
});

test("classifica jornada aberta por proximidade e remove o risco após a saída", () => {
  const cutoff = Date.parse("2026-10-25T20:50:00-03:00");
  assert.equal(assessJourneyClose(row("04:00:00", "A"), "2026-10-25", cutoff - 121 * 60_000)?.risk, "safe");
  assert.equal(assessJourneyClose(row("04:00:00", "A"), "2026-10-25", cutoff - 120 * 60_000)?.risk, "warning");
  assert.equal(assessJourneyClose(row("04:00:00", "A"), "2026-10-25", cutoff - 60 * 60_000)?.risk, "urgent");
  assert.equal(assessJourneyClose(row("04:00:00", "A"), "2026-10-25", cutoff)?.risk, "overdue");
  assert.equal(assessJourneyClose(row("04:00:00", "A", { exit_time: "18:00:00" }), "2026-10-25", cutoff)?.risk, "closed");
});

test("formata o tempo restante e o atraso para orientação operacional", () => {
  assert.equal(formatMinutesUntilDeadline(102), "faltam 1h42");
  assert.equal(formatMinutesUntilDeadline(42), "faltam 42 min");
  assert.equal(formatMinutesUntilDeadline(-73), "1h13 atrasado");
});
