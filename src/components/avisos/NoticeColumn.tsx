"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import type { NoticeCard, NoticeColumn as NoticeColumnType } from "@/lib/notice-board/types";
import type { Profile } from "@/types/database";
import { NoticeCardTile } from "./NoticeCardTile";

export function NoticeColumn({
  column, cards, profiles, onAdd, onOpen,
}: {
  column: NoticeColumnType;
  cards: NoticeCard[];
  profiles: Profile[];
  onAdd: () => void;
  onOpen: (card: NoticeCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    data: { type: "column", columnId: column.id },
  });
  return <section ref={setNodeRef} className={`notice-column color-${column.color} ${isOver ? "is-over" : ""}`}>
    <header className="notice-column-header">
      <div>
        <span className="notice-column-accent" aria-hidden="true" />
        <h2>{column.title}</h2>
        <span className="notice-column-count" aria-label={`${cards.length} cartões`}>{cards.length}</span>
      </div>
      <button type="button" onClick={onAdd} className="notice-add-card" aria-label={`Adicionar cartão em ${column.title}`}>
        <Plus aria-hidden="true" className="h-4 w-4" /><span>Adicionar</span>
      </button>
    </header>
    <div className="notice-column-list">
      <SortableContext items={cards.map((card) => `card:${card.id}`)} strategy={verticalListSortingStrategy}>
        {cards.map((card) => <NoticeCardTile
          key={card.id}
          card={card}
          assignee={profiles.find((profile) => profile.id === card.assignee_id)}
          onOpen={() => onOpen(card)}
        />)}
      </SortableContext>
      {!cards.length && <button type="button" onClick={onAdd} className="notice-empty-column">
        <Plus aria-hidden="true" className="h-4 w-4" />Criar o primeiro cartão
      </button>}
    </div>
  </section>;
}
