import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boardOrders, cardsByColumn, moveNoticeCard } from "../src/lib/notice-board/board";
import type { NoticeCard, NoticeColumn } from "../src/lib/notice-board/types";

const columns: NoticeColumn[] = [
  { id: "11111111-1111-1111-1111-111111111111", key: "notices", title: "Avisos", position: 1000, color: "blue" },
  { id: "22222222-2222-2222-2222-222222222222", key: "in-progress", title: "Em andamento", position: 2000, color: "amber" },
];
const card = (id: string, column_id: string, position: number): NoticeCard => ({
  id, column_id, position, title: id, description: "", priority: "normal", assignee_id: null,
  labels: [], due_date: null, created_by: "user", created_at: "2026-10-14T10:00:00Z", updated_at: "2026-10-14T10:00:00Z",
});

test("move cartão entre colunas e normaliza posições", () => {
  const cards = [card("a", columns[0].id, 1000), card("b", columns[0].id, 2000), card("c", columns[1].id, 1000)];
  const moved = moveNoticeCard(columns, cards, "b", columns[1].id, "c");
  const grouped = cardsByColumn(columns, moved);
  assert.deepEqual(grouped[columns[0].id].map((item) => item.id), ["a"]);
  assert.deepEqual(grouped[columns[1].id].map((item) => item.id), ["b", "c"]);
  assert.deepEqual(grouped[columns[1].id].map((item) => item.position), [1000, 2000]);
});

test("reordena dentro da coluna e prepara payload transacional", () => {
  const cards = [card("a", columns[0].id, 1000), card("b", columns[0].id, 2000), card("c", columns[0].id, 3000)];
  const moved = moveNoticeCard(columns, cards, "c", columns[0].id, "a");
  assert.deepEqual(boardOrders(columns, moved)[columns[0].id], ["c", "a", "b"]);
});

const migration = readFileSync(new URL("../supabase/migrations/20261014000000_notice_board.sql", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/layout/Sidebar.tsx", import.meta.url), "utf8");
const access = readFileSync(new URL("../src/lib/access-control.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/lib/services/notice-board-service.ts", import.meta.url), "utf8");

test("migração protege o quadro, anexos e histórico", () => {
  assert.match(migration, /ALTER TABLE public\.notice_board_cards ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.notice_board_history/);
  assert.match(migration, /notice-board-attachments/);
  assert.match(migration, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.notice_board_cards/);
});

test("Quadro de Avisos aparece no menu e está disponível para operadores autenticados", () => {
  assert.match(sidebar, /href: "\/avisos"/);
  assert.match(access, /"\/avisos"/);
});

test("edição de cartão bloqueia sobrescrita de uma versão alterada por outro analista", () => {
  assert.match(service, /\.eq\("updated_at", expectedUpdatedAt\)/);
  assert.match(service, /alterado por outro analista/);
});
