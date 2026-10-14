import type { NoticeCard, NoticeColumn } from "./types";

export function cardsByColumn(columns: NoticeColumn[], cards: NoticeCard[]) {
  return Object.fromEntries(columns.map((column) => [
    column.id,
    cards.filter((card) => card.column_id === column.id).sort((a, b) => a.position - b.position),
  ])) as Record<string, NoticeCard[]>;
}

export function moveNoticeCard(
  columns: NoticeColumn[],
  cards: NoticeCard[],
  activeCardId: string,
  targetColumnId: string,
  targetCardId?: string
) {
  const grouped = cardsByColumn(columns, cards);
  const active = cards.find((card) => card.id === activeCardId);
  if (!active || !grouped[targetColumnId]) return cards;

  const source = grouped[active.column_id].filter((card) => card.id !== activeCardId);
  const destination = active.column_id === targetColumnId ? source : grouped[targetColumnId];
  const targetIndex = targetCardId ? destination.findIndex((card) => card.id === targetCardId) : destination.length;
  destination.splice(targetIndex < 0 ? destination.length : targetIndex, 0, { ...active, column_id: targetColumnId });
  grouped[active.column_id] = source;
  grouped[targetColumnId] = destination;

  return columns.flatMap((column) => grouped[column.id].map((card, index) => ({
    ...card,
    position: (index + 1) * 1000,
  })));
}

export function boardOrders(columns: NoticeColumn[], cards: NoticeCard[]) {
  const grouped = cardsByColumn(columns, cards);
  return Object.fromEntries(columns.map((column) => [column.id, grouped[column.id].map((card) => card.id)]));
}
