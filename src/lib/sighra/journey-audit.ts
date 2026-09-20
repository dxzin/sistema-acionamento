import type { JourneyProviderKind } from "./journey-config";

export type JourneyAuditOutcome = "requested" | "preview" | "applied" | "canceled" | "blocked" | "failed";

export interface JourneyAuditPayload {
  recordId: string;
  login: string;
  operationalDate: string;
  shift: string;
  status: string;
  requestedAt: string;
  outcome: JourneyAuditOutcome;
  result?: string | null;
  startTimestamp?: string | null;
  endTimestamp?: string | null;
  startMacroId?: string | null;
  endMacroId?: string | null;
  queryId?: string | null;
  reason?: string | null;
}

const STORAGE_KEY = "sighra-journey-pilot-audit";

export async function recordJourneyAudit(payload: JourneyAuditPayload, provider: JourneyProviderKind) {
  try {
    const current = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]") as unknown[];
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...current.slice(-99), { ...payload, provider, loggedAt: new Date().toISOString() }]));
  } catch {
    // A auditoria persistente continua disponível para o provedor real.
  }
  if (provider !== "sighra") return;
  try {
    await fetch("/api/integracoes/sighra/jornada/auditoria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: payload.outcome === "canceled",
    });
  } catch {
    // Falha de auditoria não pode provocar uma segunda gravação da jornada.
  }
}
