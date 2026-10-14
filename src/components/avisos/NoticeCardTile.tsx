"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { CalendarClock, GripVertical, MessageSquare, Paperclip, UserRound } from "lucide-react";
import type { NoticeCard, NoticeLabel } from "@/lib/notice-board/types";
import type { Profile } from "@/types/database";

export const NOTICE_LABELS: Record<NoticeLabel, { label: string; className: string }> = {
  operation: { label: "Operação", className: "notice-label-operation" },
  pending: { label: "Pendência", className: "notice-label-pending" },
  safety: { label: "Segurança", className: "notice-label-safety" },
  client: { label: "Cliente", className: "notice-label-client" },
  maintenance: { label: "Manutenção", className: "notice-label-maintenance" },
};

const PRIORITY_LABEL = { normal: "Normal", important: "Importante", urgent: "Urgente" } as const;

export function NoticeCardTile({
  card,
  assignee,
  commentCount = 0,
  attachmentCount = 0,
  onOpen,
}: {
  card: NoticeCard;
  assignee?: Profile;
  commentCount?: number;
  attachmentCount?: number;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card:${card.id}`,
    data: { type: "card", cardId: card.id, columnId: card.column_id },
  });
  const overdue = Boolean(card.due_date && card.due_date < new Date().toISOString().slice(0, 10));

  return <article
    ref={setNodeRef}
    style={{ transform: CSS.Transform.toString(transform), transition }}
    className={`notice-card priority-${card.priority} ${isDragging ? "is-dragging" : ""}`}
  >
    <div className="flex items-start gap-2">
      <button
        type="button"
        className="notice-drag-handle"
        aria-label={`Mover cartão ${card.title}. Pressione espaço e use as setas.`}
        {...attributes}
        {...listeners}
      ><GripVertical aria-hidden="true" className="h-4 w-4" /></button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          <span className={`notice-priority priority-${card.priority}`}>{PRIORITY_LABEL[card.priority]}</span>
          {card.labels.map((label) => <span key={label} className={`notice-label ${NOTICE_LABELS[label]?.className || ""}`}>
            {NOTICE_LABELS[label]?.label || label}
          </span>)}
        </div>
        <h3 className="notice-card-title">{card.title}</h3>
        {card.description && <p className="notice-card-description">{card.description}</p>}
      </button>
    </div>
    <button type="button" onClick={onOpen} className="notice-card-meta" aria-label={`Abrir detalhes de ${card.title}`}>
      <span><UserRound aria-hidden="true" className="h-3.5 w-3.5" />{assignee?.name || "Sem responsável"}</span>
      {card.due_date && <span className={overdue ? "is-overdue" : ""}><CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />{new Date(`${card.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</span>}
      {commentCount > 0 && <span><MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />{commentCount}</span>}
      {attachmentCount > 0 && <span><Paperclip aria-hidden="true" className="h-3.5 w-3.5" />{attachmentCount}</span>}
    </button>
  </article>;
}
