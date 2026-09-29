import assert from "node:assert/strict";
import test from "node:test";
import { isValidLocationName, normalizeLocationName } from "../src/lib/locations/location-name";

test("normaliza nome de local para comparação e cadastro", () => {
  assert.equal(normalizeLocationName("  Ribeirão   Preto "), "RIBEIRÃO PRETO");
});

test("aceita cidades, unidades operacionais e códigos de bases conhecidos", () => {
  for (const value of ["UBERABA", "MAGNÓLIA I", "RINCÃO DO PINHAL", "LP", "LZ", "UB", "JP", "MS"]) {
    assert.equal(isValidLocationName(value), true, value);
  }
});

test("rejeita horários, números, placas, status e textos da planilha", () => {
  for (const value of [
    "00:00:00",
    "20:15",
    "11380",
    "SJE7G26",
    "PZB0F54",
    "ACIONADO",
    "APOIO",
    "DESTINO FINAL",
    "INSERIR LOCAL",
    "C/V",
    "Q",
  ]) {
    assert.equal(isValidLocationName(value), false, value);
  }
});
