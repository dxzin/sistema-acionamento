import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DispatchGrid } from "../../src/components/acionamento/DispatchGrid";
import type { DispatchRowModel } from "../../src/types/domain";
import AcionamentoPage from "../../src/app/acionamento/page";

function row(id: string, name: string): DispatchRowModel {
  const city = id === "gabriel" ? "LZ" : "UB";
  return { id, driver_id: id, daily_sheet_id: "local-sheet", dispatch_status: "", observations: "",
    driver: { id, name, login_matricula: id, default_start_time: "04:00:00" },
    base: { id: `base-${city}`, code: city, name: city },
  } as DispatchRowModel;
}

function Harness() {
  const [rows, setRows] = useState([row("joao", "JOÃO"), row("gabriel", "GABRIEL"), row("ana", "ANA")]);
  const [writes, setWrites] = useState<unknown[]>([]);
  const [batchRequests, setBatchRequests] = useState<string[][]>([]);
  const draft = (id: string, changes: Partial<DispatchRowModel>) => {
    setRows(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
  };
  const save = async (id: string, changes: Partial<DispatchRowModel>) => {
    setWrites(current => [...current, { id, changes }]);
    draft(id, changes);
  };
  // Test controls deliver server changes without stealing focus from the real grid.
  Object.assign(window, {
    refreshGrid: () => setRows(current => [...current].reverse()),
    removeJoao: () => setRows(current => current.filter(item => item.id !== "joao")),
    replaceGrid: () => setRows([row("novo1", "NOVO UM"), row("novo2", "NOVO DOIS")].map((item, index) => ({
      ...item,
      dispatch_status: "ACIONADO",
      driver: { ...item.driver, login_matricula: String(200 + index) },
    }))),
    insertDriver: () => setRows(current => [row("novo", "NOVO CONDUTOR"), ...current]),
    changeJoaoShift: () => setRows(current => current.map(item => item.id === "joao"
      ? { ...item, driver: { ...item.driver, default_start_time: "00:00:00" } } : item)),
    makeJourneyEligible: () => setRows(current => current.map((item, index) => ({
      ...item,
      dispatch_status: "ACIONADO",
      driver: { ...item.driver, login_matricula: String(100 + index) },
    }))),
  });
  return <><DispatchGrid dispatches={rows} showCity onDraftRow={draft} onUpdateRow={save}
    onUpdateBatch={async updates => { for (const [id, changes] of updates) await save(id, changes); }}
    locations={[]} saveState={{ status: "idle" }} journeyPilotEnabled
    onRequestJourneyBatch={ids => setBatchRequests(current => [...current, ids])} />
    <pre id="writes">{JSON.stringify(writes)}</pre>
    <pre id="batch-requests">{JSON.stringify(batchRequests)}</pre></>;
}
createRoot(document.getElementById("root")!).render(["/page", "/journey"].includes(location.pathname) ? <AcionamentoPage /> : <Harness />);
