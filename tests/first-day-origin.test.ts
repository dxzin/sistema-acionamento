import assert from "node:assert/strict";
import test from "node:test";
import { resolveFirstDayBaseOrigin } from "../src/lib/calculations/first-day-origin";
import { Base, Driver, Location } from "../src/types/database";

const base = { id: "base-castilho", code: "CASTILHO", name: "Castilho", is_active: true, interjornada_minutes: 670, created_at: "" } satisfies Base;
const driver = { id: "anizio", name: "ANIZIO BARROS", login_matricula: "1", base_id: base.id, is_active: true, created_at: "", updated_at: "" } satisfies Driver;
const locations = [{ id: "loc-castilho", name: "CASTILHO", is_active: true, created_at: "" }] satisfies Location[];

test("usa a base cadastrada quando o condutor está no dia 1 e não há origem", () => {
  assert.equal(resolveFirstDayBaseOrigin("1", null, driver, [base], locations), "loc-castilho");
});

test("não substitui continuidade existente nem usa base em outros dias", () => {
  assert.equal(resolveFirstDayBaseOrigin("1", "loc-anterior", driver, [base], locations), null);
  assert.equal(resolveFirstDayBaseOrigin("2", null, driver, [base], locations), null);
});
