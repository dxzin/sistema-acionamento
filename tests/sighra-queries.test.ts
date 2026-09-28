import assert from "node:assert/strict";
import test from "node:test";
import { exitTime, jobView, macroLocation, macroMapUrl, parseResult, validDate, validLogin } from "../src/lib/sighra/queries";
import { POST, PATCH } from "../src/app/api/integracoes/sighra/tarefas/route";

const end = { login: "30049", name: "FIM DE JORNADA GA", gps_at: "2026-09-16 12:20:33", inserted_at: "2026-09-16 12:20:46", vehicle: "220842" };
test("consulta valida login e datas sem permitir SQL na ponte", () => {
  for (const login of ["30049 OR 1=1", "'30049'", "", "x", "3".repeat(21)]) assert.equal(validLogin(login), false);
  assert.equal(validLogin("0030049"), true);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-09-16"), true);
});
test("fim de jornada separado das ultimas dez macros preserva GPS e descarta segundos", () => {
  const macros = Array.from({ length: 10 }, (_, i) => ({ ...end, name: "REINICIO DE VIAGEM", gps_at: `2026-09-17 14:${String(i).padStart(2, "0")}:19` }));
  const result = parseResult({ macros, last_end: end }, "30049", "2026-08-18");
  assert.equal(result.macros[0].gps_at, "2026-09-17 14:09:19");
  assert.equal(exitTime(result.last_end!), "12:20:00");
  assert.equal(parseResult({ macros: [], last_end: null }, "30049", "2026-08-18").last_end, null);
});
test("resultado rejeita motorista errado, mensagem com senha, horarios invalidos e fim fora do periodo", () => {
  for (const changed of [{ login: "93586" }, { msg: "SENHA: segredo" }, { gps_at: "2026-09-16 24:20:33" }, { gps_at: "2026-02-30 12:20:33" }]) {
    assert.throws(() => parseResult({ macros: [{ ...end, ...changed }], last_end: null }, "30049", "2026-08-18"));
  }
  assert.throws(() => parseResult({ macros: Array(11).fill(end), last_end: end }, "30049", "2026-08-18"));
  assert.throws(() => parseResult({ macros: [], last_end: { ...end, name: "REFEIÇÃO" } }, "30049", "2026-08-18"));
  assert.throws(() => parseResult({ macros: [], last_end: end }, "30049", "2026-09-17"));
});
test("pedido pendente expira sem inferir que o motorista continua em jornada", () => {
  const job = { id: "test", login: "30049", status: "running", created_at: "2026-09-17", since_date: "2026-08-18", expires_at: "2000-01-01", result: null, error: null };
  assert.equal(jobView(job).status, "expired");
  assert.equal(jobView({ ...job, status: "completed" }).status, "completed");
});
test("placa e local seguem o veiculo e as coordenadas da macro com suporte a ponte anterior", () => {
  const event = { ...end, plate: "ABC1D23", point: "Garagem", city: "São Paulo", state: "SP", street: "Rua A", latitude: -23.55, longitude: -46.63 };
  const result = parseResult({ macros: [event], last_end: event }, "30049", "2026-08-18");
  assert.equal(result.macros[0].plate, "ABC1D23");
  assert.equal(macroLocation(result.macros[0]), "Garagem · Rua A · São Paulo / SP");
  assert.equal(macroMapUrl(result.macros[0]), "https://www.google.com/maps?q=-23.55,-46.63");
  assert.equal(macroMapUrl({ ...event, latitude: 0, longitude: 0 }), null);
  assert.equal(macroMapUrl(end), null);
  assert.equal(parseResult({ macros: [end], last_end: null }, "30049", "2026-08-18").macros[0].plate, null);
  for (const changed of [{ latitude: 91 }, { longitude: 181 }, { latitude: "-23.55" }, { point: "x".repeat(256) }]) {
    assert.throws(() => parseResult({ macros: [{ ...event, ...changed }], last_end: null }, "30049", "2026-08-18"));
  }
});
test("sequência de jornada preserva IDs e ordem cronológica", () => {
  const start = { ...end, id: "macro-start", name: "INÍCIO DE JORNADA", gps_at: "2026-09-16 04:30:00" };
  const finish = { ...end, id: "macro-end", gps_at: "2026-09-17 00:20:00" };
  const result = parseResult({ macros: [], last_end: finish, journey_events: [finish, start] }, "30049", "2026-08-18");
  assert.deepEqual(result.journey_events?.map(item => item.id), ["macro-start", "macro-end"]);
  assert.throws(() => parseResult({ macros: [], last_end: null, journey_events: Array(41).fill(start) }, "30049", "2026-08-18"));
});

test("resposta aceita reinícios da jornada e rejeita outros tipos nesta lista", () => {
  const restart = { ...end, id: "restart", name: "REINÍCIO DE VIAGEM", plate: "ABC1D23" };
  const result = parseResult({ macros: [], last_end: null, journey_events: [], restart_events: [restart] }, "30049", "2026-09-16");
  assert.equal(result.restart_events?.[0].plate, "ABC1D23");
  assert.throws(() => parseResult({ macros: [], last_end: null, restart_events: [end] }, "30049", "2026-09-16"));
});
test("endpoints da fila bloqueiam chamada sem chave antes de acessar dados", async () => {
  const request = () => new Request("http://localhost/api/integracoes/sighra/tarefas", { method: "POST" });
  assert.equal((await POST(request())).status, 401);
  assert.equal((await PATCH(request())).status, 401);
});
