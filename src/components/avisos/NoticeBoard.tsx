"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor,
  closestCorners, useSensor, useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { AlertCircle, Loader2, Megaphone, Plus, RefreshCw, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cardsByColumn, moveNoticeCard } from "@/lib/notice-board/board";
import { noticeBoardService } from "@/lib/services/notice-board-service";
import type { NoticeBoardData, NoticeCard, NoticeCardInput } from "@/lib/notice-board/types";
import type { Profile } from "@/types/database";
import { NoticeCardDialog } from "./NoticeCardDialog";
import { NoticeColumn } from "./NoticeColumn";

const emptyBoard: NoticeBoardData = { columns: [], cards: [], profiles: [] };

export function NoticeBoard({ currentUser }: { currentUser: Profile }) {
  const [board, setBoard] = useState(emptyBoard);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [newCardColumnId, setNewCardColumnId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const requestRef = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = useCallback(async (background = false) => {
    const request = ++requestRef.current;
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const data = await noticeBoardService.loadBoard();
      if (request !== requestRef.current) return;
      setBoard(data);
      setError("");
    } catch {
      if (request === requestRef.current) setError("Não foi possível carregar o Quadro de Avisos. Confira a conexão e a migração do banco.");
    } finally {
      if (request === requestRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (document.visibilityState === "visible") void load(true); }, 350);
    };
    const channel = supabase.channel("notice-board-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "notice_board_columns" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notice_board_cards" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notice_board_comments" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notice_board_attachments" }, refresh)
      .subscribe();
    const visible = () => { if (document.visibilityState === "visible") void load(true); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const grouped = useMemo(() => cardsByColumn(board.columns, board.cards), [board.cards, board.columns]);
  const selectedCard = selectedCardId ? board.cards.find((card) => card.id === selectedCardId) || null : null;
  const activeCard = activeCardId ? board.cards.find((card) => card.id === activeCardId) || null : null;

  function dragStart(event: DragStartEvent) {
    setActiveCardId(String(event.active.id).replace("card:", ""));
  }

  async function dragEnd(event: DragEndEvent) {
    setActiveCardId(null);
    if (!event.over) return;
    const cardId = String(event.active.id).replace("card:", "");
    const overId = String(event.over.id);
    const targetCardId = overId.startsWith("card:") ? overId.replace("card:", "") : undefined;
    const targetCard = targetCardId ? board.cards.find((card) => card.id === targetCardId) : null;
    const targetColumnId = targetCard?.column_id || overId.replace("column:", "");
    const nextCards = moveNoticeCard(board.columns, board.cards, cardId, targetColumnId, targetCardId);
    if (nextCards === board.cards) return;
    setBoard((current) => ({ ...current, cards: nextCards }));
    try { await noticeBoardService.reorder(board.columns, nextCards); }
    catch { setError("Não foi possível salvar a nova posição. O quadro será recarregado."); void load(true); }
  }

  async function saveCard(input: NoticeCardInput, expectedUpdatedAt?: string) {
    if (selectedCard) {
      if (!expectedUpdatedAt) throw new Error("Não foi possível validar a versão atual do cartão.");
      const updated = await noticeBoardService.updateCard(selectedCard.id, input, expectedUpdatedAt);
      let nextCards = board.cards.map((card) => card.id === updated.id ? updated : card);
      if (selectedCard.column_id !== updated.column_id) {
        nextCards = moveNoticeCard(board.columns, nextCards, updated.id, updated.column_id);
        await noticeBoardService.reorder(board.columns, nextCards);
      }
      setBoard((current) => ({ ...current, cards: nextCards }));
      setSelectedCardId(null);
    } else {
      const columnCards = grouped[input.column_id] || [];
      const position = (columnCards.at(-1)?.position || 0) + 1000;
      const created = await noticeBoardService.createCard(input, currentUser.id, position);
      setBoard((current) => ({ ...current, cards: [...current.cards, created] }));
      setNewCardColumnId(null);
    }
  }

  async function reorderSelected(direction: -1 | 1) {
    if (!selectedCard) return;
    const current = grouped[selectedCard.column_id] || [];
    const index = current.findIndex((card) => card.id === selectedCard.id);
    const destination = index + direction;
    if (destination < 0 || destination >= current.length) return;
    const targetCardId = direction < 0 ? current[destination].id : current[destination + 1]?.id;
    const nextCards = moveNoticeCard(board.columns, board.cards, selectedCard.id, selectedCard.column_id, targetCardId);
    setBoard((value) => ({ ...value, cards: nextCards }));
    await noticeBoardService.reorder(board.columns, nextCards);
  }

  if (loading) return <div className="notice-board-state"><Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /><strong>Carregando o quadro…</strong></div>;

  return <>
    <div className="notice-board-toolbar">
      <div><span className="notice-live"><Wifi aria-hidden="true" />Atualização em tempo real</span><strong>{board.cards.length} cartões</strong></div>
      <div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="notice-secondary-button"><RefreshCw aria-hidden="true" className={refreshing ? "animate-spin motion-reduce:animate-none" : ""} />Atualizar</button>
        <button type="button" onClick={() => setNewCardColumnId(board.columns[0]?.id || null)} disabled={!board.columns.length}><Plus aria-hidden="true" />Novo cartão</button>
      </div>
    </div>
    {error && <div role="alert" className="notice-board-error"><AlertCircle aria-hidden="true" />{error}</div>}
    {!board.columns.length ? <div className="notice-board-state"><Megaphone aria-hidden="true" /><strong>As colunas ainda não foram configuradas.</strong><span>Aplique a migração do Quadro de Avisos no banco.</span></div> :
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={dragStart} onDragEnd={(event) => void dragEnd(event)} onDragCancel={() => setActiveCardId(null)}>
        <div className="notice-board-canvas" aria-label="Quadro de Avisos">
          {board.columns.map((column) => <NoticeColumn
            key={column.id} column={column} cards={grouped[column.id] || []} profiles={board.profiles}
            onAdd={() => setNewCardColumnId(column.id)} onOpen={(card) => setSelectedCardId(card.id)}
          />)}
        </div>
        <DragOverlay>{activeCard && <div className="notice-card notice-card-overlay"><strong>{activeCard.title}</strong></div>}</DragOverlay>
      </DndContext>}
    {(selectedCard || newCardColumnId) && <NoticeCardDialog
      card={selectedCard}
      initialColumnId={selectedCard?.column_id || newCardColumnId || board.columns[0]?.id}
      columns={board.columns}
      profiles={board.profiles}
      currentUser={currentUser}
      onClose={() => { setSelectedCardId(null); setNewCardColumnId(null); }}
      onSave={saveCard}
      onReorder={reorderSelected}
    />}
  </>;
}
