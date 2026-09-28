import { macroLocation, type SighraMacro, type SighraResult } from "./queries";
import { classifyJourneyEvent, type JourneyEvent, type JourneyRecordSnapshot } from "./journey";
import { JOURNEY_FEATURE, type JourneyProviderKind } from "./journey-config";

export interface JourneyProviderResult {
  provider: JourneyProviderKind;
  requestedAt: string;
  queryId: string;
  events: JourneyEvent[];
}

export interface JourneyProvider {
  readonly kind: JourneyProviderKind;
  fetchJourneyEvents(record: JourneyRecordSnapshot, signal?: AbortSignal): Promise<JourneyProviderResult>;
}

function eventId(macro: SighraMacro) {
  return macro.id || `legacy:${macro.login}:${macro.gps_at}:${macro.name}:${macro.vehicle || ""}`;
}

export function mapSighraJourneyEvent(macro: SighraMacro): JourneyEvent {
  return {
    id: eventId(macro),
    login: macro.login,
    name: macro.name,
    type: classifyJourneyEvent(macro.name),
    occurredAt: macro.gps_at.replace(" ", "T"),
    receivedAt: macro.inserted_at?.replace(" ", "T") || null,
    vehicle: macro.vehicle,
    plate: macro.plate,
    location: macroLocation(macro) || null,
  };
}

async function responseJson(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.erro || "Não foi possível consultar a jornada.");
  return data;
}

export class SighraJourneyProvider implements JourneyProvider {
  readonly kind = "sighra" as const;

  async fetchJourneyEvents(record: JourneyRecordSnapshot, signal?: AbortSignal): Promise<JourneyProviderResult> {
    const requestedAt = new Date().toISOString();
    let job = await responseJson(await fetch("/api/integracoes/sighra/consultas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: record.login, since: record.operationalDate }),
      signal,
    }));
    const deadline = Date.now() + 195_000;
    while (["queued", "running"].includes(job.status)) {
      if (Date.now() >= deadline) throw new Error("A ponte não respondeu a tempo. Confira a VPN e tente novamente.");
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, 2000);
        signal?.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Cancelado", "AbortError")); }, { once: true });
      });
      job = await responseJson(await fetch(`/api/integracoes/sighra/consultas?id=${job.id}`, { cache: "no-store", signal }));
    }
    if (job.status !== "completed") throw new Error(job.error || "A consulta SIGhRa não foi concluída.");
    const result = job.result as SighraResult;
    if (!Array.isArray(result?.journey_events)) {
      throw new Error("A ponte ainda não fornece a sequência completa da jornada. Atualize o script local da ponte antes de usar o piloto.");
    }
    return { provider: job.simulation === true ? "mock" : this.kind, requestedAt, queryId: job.id,
      events: [...result.journey_events, ...(result.restart_events || [])].map(mapSighraJourneyEvent) };
  }
}

function addDay(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function mockEvents(record: JourneyRecordSnapshot): JourneyEvent[] {
  const hour = Number((record.shift || "04:00").slice(0, 2));
  const startTime = hour === 20 ? "20:10:00" : hour === 4 ? "04:30:00" : "12:10:00";
  const endTime = hour === 20 ? "09:00:00" : hour === 4 ? "00:20:00" : "23:50:00";
  const receivedDelay = (timestamp: string) => `${timestamp.slice(0, 17)}30`;
  const start = `${record.operationalDate}T${startTime}`;
  const end = `${hour === 12 ? record.operationalDate : addDay(record.operationalDate)}T${endTime}`;
  return [
    { id: `mock:${record.recordId}:start`, login: record.login, name: "INÍCIO DE JORNADA", type: "start", occurredAt: start, receivedAt: receivedDelay(start), vehicle: null },
    { id: `mock:${record.recordId}:end`, login: record.login, name: "FIM DE JORNADA", type: "end", occurredAt: end, receivedAt: receivedDelay(end), vehicle: null },
  ];
}

export class MockJourneyProvider implements JourneyProvider {
  readonly kind = "mock" as const;

  async fetchJourneyEvents(record: JourneyRecordSnapshot, signal?: AbortSignal): Promise<JourneyProviderResult> {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 450);
      signal?.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Cancelado", "AbortError")); }, { once: true });
    });
    return { provider: this.kind, requestedAt: new Date().toISOString(), queryId: `mock:${record.recordId}:${Date.now()}`, events: mockEvents(record) };
  }
}

export function createJourneyProvider(): JourneyProvider {
  return JOURNEY_FEATURE.provider === "sighra" ? new SighraJourneyProvider() : new MockJourneyProvider();
}
