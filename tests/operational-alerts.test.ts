import test from "node:test";
import assert from "node:assert/strict";
import { summarizeOperationalAlerts } from "../src/lib/calculations/operational-alerts";
import { DispatchRowModel } from "../src/types/domain";

function row(overrides: Partial<DispatchRowModel>): DispatchRowModel {
  return {
    id: crypto.randomUUID(), daily_sheet_id: "sheet", driver_id: "driver", dispatch_status: "",
    created_at: "", updated_at: "", driver: {
      id: "driver", name: "Condutor", login_matricula: "1", base_id: "base", is_active: true,
      created_at: "", updated_at: "",
    },
    ...overrides,
  };
}

test("resume somente pendências operacionais existentes", () => {
  const summary = summarizeOperationalAlerts([
    row({ dispatch_status: "ACIONADO" }),
    row({ dispatch_status: "ACIONADO", entry_time: "04:00:00" }),
    row({ dispatch_status: "ABONADO", abono_authorized_by: "PENDENTE" }),
    row({ dispatch_status: "ACIONADO", entry_time: "04:00:00", exit_time: "16:00:00" }),
  ], "05:00:00");

  assert.deepEqual(summary, {
    acionadosSemEntrada: 1,
    jornadasAbertas: 1,
    abonosPendentes: 1,
    jornadasAcimaDoLimite: 1,
    fechamentosProximos: 0,
    fechamentosAtrasados: 0,
  });
});
