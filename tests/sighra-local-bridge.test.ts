import assert from "node:assert/strict";
import test from "node:test";
import {
  claimLocalBridgeJob,
  completeLocalBridgeJob,
  enqueueLocalBridgeJob,
  getLocalBridgeJob,
  getLocalBridgeStatus,
  localBridgeTestEnabled,
  resetLocalBridgeForTests,
  touchLocalBridge,
} from "../src/lib/sighra/local-bridge";

test("fila local completa uma consulta sem usar a fila compartilhada", () => {
  const previous = process.env.SIGHRA_LOCAL_BRIDGE_TEST;
  process.env.SIGHRA_LOCAL_BRIDGE_TEST = "true";
  try {
    resetLocalBridgeForTests();
    assert.equal(localBridgeTestEnabled(), true);
    touchLocalBridge(true, true);
    assert.equal(getLocalBridgeStatus().databaseOk, true);
    const queued = enqueueLocalBridgeJob("usuario-local", "28156", "2026-09-20");
    const claimed = claimLocalBridgeJob();
    assert.equal(claimed?.id, queued.id);
    const completed = completeLocalBridgeJob(claimed!.id, claimed!.leaseToken!, {
      macros: [], last_end: null, journey_events: [],
    }, false);
    assert.equal(completed?.status, "completed");
    assert.deepEqual(getLocalBridgeJob(queued.id, "usuario-local")?.result?.journey_events, []);
    assert.equal(getLocalBridgeJob(queued.id, "outro-usuario"), null);
  } finally {
    if (previous === undefined) delete process.env.SIGHRA_LOCAL_BRIDGE_TEST;
    else process.env.SIGHRA_LOCAL_BRIDGE_TEST = previous;
    resetLocalBridgeForTests();
  }
});

test("fila local descarta tarefas expiradas para não acumular resultados em memória", () => {
  const originalNow = Date.now;
  let now = Date.parse("2026-09-20T12:00:00.000Z");
  Date.now = () => now;
  try {
    resetLocalBridgeForTests();
    const queued = enqueueLocalBridgeJob("usuario-local", "28156", "2026-09-20");
    assert.ok(getLocalBridgeJob(queued.id, "usuario-local"));

    now += 181_000;
    assert.equal(getLocalBridgeJob(queued.id, "usuario-local"), null);
  } finally {
    Date.now = originalNow;
    resetLocalBridgeForTests();
  }
});

test("build otimizado local mantém a ponte de teste quando ela foi habilitada explicitamente", () => {
  const previousFlag = process.env.SIGHRA_LOCAL_BRIDGE_TEST;
  const previousNodeEnv = Object.getOwnPropertyDescriptor(process.env, "NODE_ENV");
  try {
    Object.defineProperty(process.env, "NODE_ENV", { configurable: true, enumerable: true, writable: true, value: "production" });
    process.env.SIGHRA_LOCAL_BRIDGE_TEST = "true";
    assert.equal(localBridgeTestEnabled(), true);
  } finally {
    if (previousFlag === undefined) delete process.env.SIGHRA_LOCAL_BRIDGE_TEST;
    else process.env.SIGHRA_LOCAL_BRIDGE_TEST = previousFlag;
    if (previousNodeEnv) Object.defineProperty(process.env, "NODE_ENV", previousNodeEnv);
    else Reflect.deleteProperty(process.env, "NODE_ENV");
  }
});

test("tarefas da ponte simulada preservam a identificação de dados fictícios", () => {
  resetLocalBridgeForTests();
  try {
    touchLocalBridge(true, true, true);
    const queued = enqueueLocalBridgeJob("usuario-local", "67511", "2026-09-20", getLocalBridgeStatus().simulation);
    assert.equal(queued.simulation, true);
    assert.equal(getLocalBridgeStatus().simulation, true);
  } finally {
    resetLocalBridgeForTests();
  }
});
