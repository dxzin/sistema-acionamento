import { parseResult, type SighraResult } from "./queries";

export type LocalBridgeStatus = {
  lastSeenAt: string | null;
  lastDatabaseOkAt: string | null;
  databaseOk: boolean;
  queryEnabled: boolean;
  simulation: boolean;
};

export type LocalBridgeJob = {
  id: string;
  batchId: string | null;
  requestedBy: string;
  login: string;
  sinceDate: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  expiresAt: string;
  leaseToken: string | null;
  result: SighraResult | null;
  error: string | null;
  simulation: boolean;
};

type LocalBridgeStore = { status: LocalBridgeStatus; jobs: Map<string, LocalBridgeJob> };

const STORE_KEY = Symbol.for("sistema-acionamento.sighra-local-bridge");
const COMPLETED_JOB_RETENTION_MS = 5 * 60_000;
const MAX_RETAINED_JOBS = 200;

function store(): LocalBridgeStore {
  const root = globalThis as typeof globalThis & { [STORE_KEY]?: LocalBridgeStore };
  if (!root[STORE_KEY]) {
    root[STORE_KEY] = {
      status: { lastSeenAt: null, lastDatabaseOkAt: null, databaseOk: false, queryEnabled: false, simulation: false },
      jobs: new Map(),
    };
  }
  return root[STORE_KEY];
}

function pruneLocalBridgeJobs(now = Date.now()): void {
  const jobs = store().jobs;
  for (const [id, job] of jobs) {
    const expired = Date.parse(job.expiresAt) <= now;
    const completedTooLongAgo = ["completed", "failed"].includes(job.status)
      && Date.parse(job.createdAt) + COMPLETED_JOB_RETENTION_MS <= now;
    if (expired || completedTooLongAgo) jobs.delete(id);
  }

  if (jobs.size <= MAX_RETAINED_JOBS) return;
  const removable = [...jobs.values()]
    .filter((job) => ["completed", "failed"].includes(job.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const job of removable) {
    if (jobs.size <= MAX_RETAINED_JOBS) break;
    jobs.delete(job.id);
  }
}

export function localBridgeTestEnabled(): boolean {
  // O build otimizado local também usa NODE_ENV=production. A ponte continua
  // opt-in e depende de uma chave exclusiva que existe apenas na configuração
  // local ignorada pelo Git.
  return process.env.SIGHRA_LOCAL_BRIDGE_TEST === "true";
}

export function localBridgeToken(): string | null {
  if (!localBridgeTestEnabled()) return null;
  const token = process.env.SIGHRA_LOCAL_BRIDGE_TOKEN;
  return token && token.length >= 32 ? token : null;
}

export function touchLocalBridge(databaseOk: boolean, queryEnabled: boolean, simulation = false): LocalBridgeStatus {
  const current = store().status;
  const now = new Date().toISOString();
  current.lastSeenAt = now;
  current.databaseOk = databaseOk;
  current.queryEnabled = queryEnabled;
  current.simulation = simulation;
  if (databaseOk) current.lastDatabaseOkAt = now;
  return { ...current };
}

export function getLocalBridgeStatus(): LocalBridgeStatus {
  return { ...store().status };
}

function enqueueLocalBridgeJobWithOptions(
  requestedBy: string,
  login: string,
  sinceDate: string,
  simulation: boolean,
  batchId: string | null,
  expiresInMs: number,
  reuseActive = true
): LocalBridgeJob {
  const now = Date.now();
  pruneLocalBridgeJobs(now);
  if (reuseActive) {
    for (const job of store().jobs.values()) {
      if (job.requestedBy === requestedBy && job.login === login && job.sinceDate === sinceDate &&
        ["queued", "running"].includes(job.status) && Date.parse(job.expiresAt) > now) return { ...job };
    }
  }
  const job: LocalBridgeJob = {
    id: crypto.randomUUID(), batchId, requestedBy, login, sinceDate, status: "queued",
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + expiresInMs).toISOString(),
    leaseToken: null, result: null, error: null,
    simulation,
  };
  store().jobs.set(job.id, job);
  return { ...job };
}

export function enqueueLocalBridgeJob(requestedBy: string, login: string, sinceDate: string, simulation = false): LocalBridgeJob {
  return enqueueLocalBridgeJobWithOptions(requestedBy, login, sinceDate, simulation, null, 180_000);
}

export function enqueueLocalBridgeBatch(requestedBy: string, logins: string[], sinceDate: string, simulation = false) {
  const activeBatch = [...store().jobs.values()].find((job) =>
    job.requestedBy === requestedBy && job.batchId && ["queued", "running"].includes(job.status) &&
    Date.parse(job.expiresAt) > Date.now()
  );
  if (activeBatch?.batchId) throw new Error("BATCH_IN_PROGRESS");
  const batchId = crypto.randomUUID();
  const jobs = [...new Set(logins)].map((login) =>
    enqueueLocalBridgeJobWithOptions(requestedBy, login, sinceDate, simulation, batchId, 15 * 60_000, false)
  );
  return { batchId, jobs };
}

export function getLocalBridgeBatch(batchId: string, requestedBy: string): LocalBridgeJob[] {
  pruneLocalBridgeJobs();
  return [...store().jobs.values()]
    .filter((job) => job.batchId === batchId && job.requestedBy === requestedBy)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((job) => ({ ...job }));
}

export function cancelLocalBridgeBatch(batchId: string, requestedBy: string): number {
  let canceled = 0;
  for (const job of store().jobs.values()) {
    if (job.batchId !== batchId || job.requestedBy !== requestedBy || !["queued", "running"].includes(job.status)) continue;
    job.status = "failed";
    job.error = "Consulta em lote cancelada pelo operador.";
    canceled++;
  }
  return canceled;
}

export function claimLocalBridgeJob(): LocalBridgeJob | null {
  const now = Date.now();
  pruneLocalBridgeJobs(now);
  const job = [...store().jobs.values()]
    .filter((item) => item.status === "queued" && Date.parse(item.expiresAt) > now)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!job) return null;
  job.status = "running";
  job.leaseToken = crypto.randomUUID();
  return { ...job };
}

export function completeLocalBridgeJob(id: string, leaseToken: string, value: unknown, failed: boolean): LocalBridgeJob | null {
  const job = store().jobs.get(id);
  if (!job || job.status !== "running" || job.leaseToken !== leaseToken || Date.parse(job.expiresAt) <= Date.now()) return null;
  job.status = failed ? "failed" : "completed";
  job.result = failed ? null : parseResult(value, job.login, job.sinceDate);
  job.error = failed ? "Não foi possível consultar as macros no SIGhRA pelo notebook de teste." : null;
  return { ...job };
}

export function getLocalBridgeJob(id: string, requestedBy: string): LocalBridgeJob | null {
  pruneLocalBridgeJobs();
  const job = store().jobs.get(id);
  return job?.requestedBy === requestedBy ? { ...job } : null;
}

export function resetLocalBridgeForTests(): void {
  store().jobs.clear();
  store().status = { lastSeenAt: null, lastDatabaseOkAt: null, databaseOk: false, queryEnabled: false, simulation: false };
}
