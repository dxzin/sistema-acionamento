import assert from "node:assert/strict";
import test from "node:test";
import { canAccessPage } from "../src/lib/access-control";

test("Operação acessa somente as quatro abas operacionais e o redirecionamento inicial", () => {
  for (const path of ["/", "/acionamento", "/escala", "/condutores", "/sighra", "/escala/detalhes"]) {
    assert.equal(canAccessPage("operator", path), true, path);
  }
  for (const path of ["/historico", "/historico/", "/relatorios", "/admin", "/admin/usuarios", "/nova-aba", "/escala-extra"]) {
    assert.equal(canAccessPage("operator", path), false, path);
    assert.equal(canAccessPage(undefined, path), false, path);
    assert.equal(canAccessPage("invalid", path), false, path);
  }
});

test("Supervisores e administradores mantêm acesso a todas as abas", () => {
  for (const role of ["admin", "supervisor"]) {
    for (const path of ["/acionamento", "/escala", "/condutores", "/sighra", "/historico", "/relatorios", "/admin"]) {
      assert.equal(canAccessPage(role, path), true, `${role}: ${path}`);
    }
  }
});
