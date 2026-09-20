import type { JourneyFeatureMode } from "./journey";

export type JourneyProviderKind = "mock" | "sighra";

function featureMode(): JourneyFeatureMode {
  const configured = process.env.NEXT_PUBLIC_SIGHRA_JOURNEY_MODE;
  if (configured === "disabled" || configured === "pilot" || configured === "automatic") return configured;
  return process.env.NODE_ENV === "production" ? "disabled" : "pilot";
}

function providerKind(): JourneyProviderKind {
  return process.env.NEXT_PUBLIC_SIGHRA_JOURNEY_PROVIDER === "sighra" ? "sighra" : "mock";
}

export const JOURNEY_FEATURE = Object.freeze({
  mode: featureMode(),
  provider: providerKind(),
  // O modo automatic existe apenas como contrato futuro. Nenhum agendador é iniciado.
  pilotEnabled: featureMode() === "pilot",
  automaticEnabled: false,
});
