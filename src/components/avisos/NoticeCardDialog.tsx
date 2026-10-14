"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Clock3, Download, History, Loader2, MessageSquare, Paperclip, Save, Upload, X } from "lucide-react";
import { noticeBoardService } from "@/lib/services/notice-board-service";
import { createClient } from "@/lib/supabase/client";
import type { NoticeCard, NoticeCardDetails, NoticeCardInput, NoticeColumn, NoticeLabel, NoticePriority } from "@/lib/notice-board/types";
import type { Profile } from "@/types/database";
import { NOTICE_LABELS } from "./NoticeCardTile";

const HISTORY_LABELS = {
  created: "Cartão criado", updated: "Cartão atualizado", moved: "Cartão movido",
  commented: "Comentário adicionado", attached: "Anexo incluído", deleted: "Cartão excluído",
} as const;

const emptyDetails: NoticeCardDetails = { comments: [], attachments: [], history: [] };

export function NoticeCardDialog({
  card, initialColumnId, columns, profiles, currentUser, onClose, onSave, onReorder,
}: {
  card: NoticeCard | null;
  initialColumnId: string;
  columns: NoticeColumn[];
  profiles: Profile[];
  currentUser: Profile;
  onClose: () => void;
  onSave: (input: NoticeCardInput, expectedUpdatedAt?: string) => Promise<void>;
  onReorder: (direction: -1 | 1) => Promise<void>;
}) {
  const [title, setTitle] = useState(card?.title || "");
  const [description, setDescription] = useState(card?.description || "");
  const [priority, setPriority] = useState<NoticePriority>(card?.priority || "normal");
  const [assigneeId, setAssigneeId] = useState(card?.assignee_id || "");
  const [dueDate, setDueDate] = useState(card?.due_date || "");
  const [columnId, setColumnId] = useState(card?.column_id || initialColumnId);
  const [labels, setLabels] = useState<NoticeLabel[]>(card?.labels || []);
  const [details, setDetails] = useState(emptyDetails);
  const [comment, setComment] = useState("");
  const [loadingDetails, setLoadingDetails] = useState(Boolean(card));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const expectedUpdatedAtRef = useRef(card?.updated_at);

  const profileNames = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile.name])), [profiles]);
  const reloadDetails = async () => {
    if (!card) return;
    setLoadingDetails(true);
    try { setDetails(await noticeBoardService.loadCardDetails(card.id)); }
    catch { setError("Não foi possível carregar comentários, anexos e histórico."); }
    finally { setLoadingDetails(false); }
  };

  useEffect(() => { void reloadDetails(); }, [card?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!card) return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (document.visibilityState === "visible") void reloadDetails(); }, 250);
    };
    const filter = `card_id=eq.${card.id}`;
    const channel = supabase.channel(`notice-card:${card.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notice_board_comments", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notice_board_attachments", filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "notice_board_history", filter }, refresh)
      .subscribe();
    return () => { if (timer) clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [card?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving && !uploading) onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose, saving, uploading]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 2) { setError("Informe um título com pelo menos 2 caracteres."); return; }
    setSaving(true); setError("");
    try {
      await onSave({
        title: title.trim(), description: description.trim(), priority,
        assignee_id: assigneeId || null, labels, due_date: dueDate || null, column_id: columnId,
      }, expectedUpdatedAtRef.current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o cartão."); }
    finally { setSaving(false); }
  }

  async function addComment() {
    if (!card || !comment.trim()) return;
    setSaving(true); setError("");
    try { await noticeBoardService.addComment(card.id, currentUser.id, comment.trim()); setComment(""); await reloadDetails(); }
    catch { setError("Não foi possível adicionar o comentário."); }
    finally { setSaving(false); }
  }

  async function upload(file: File | undefined) {
    if (!card || !file) return;
    setUploading(true); setError("");
    try { await noticeBoardService.uploadAttachment(card.id, currentUser.id, file); await reloadDetails(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível anexar o arquivo."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function openAttachment(path: string) {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    try {
      const url = await noticeBoardService.attachmentUrl(path);
      if (popup) popup.location.href = url;
      else window.location.assign(url);
    } catch { popup?.close(); setError("Não foi possível abrir o anexo."); }
  }

  return <div className="notice-dialog-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !saving && !uploading) onClose();
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby="notice-dialog-title" className="notice-dialog">
      <header className="notice-dialog-header">
        <div><span>{card ? "Detalhes do cartão" : "Novo cartão"}</span><h2 id="notice-dialog-title">{card?.title || "Criar aviso ou atividade"}</h2></div>
        <button type="button" onClick={onClose} disabled={saving || uploading} aria-label="Fechar" className="notice-icon-button"><X aria-hidden="true" /></button>
      </header>
      <div className="notice-dialog-body">
        <form id="notice-card-form" onSubmit={submit} className="notice-card-form">
          {error && <p role="alert" className="notice-form-error">{error}</p>}
          <label>Título<input autoFocus required minLength={2} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Descrição<textarea maxLength={5000} rows={6} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Contexto, instruções e informações importantes" /></label>
          <div className="notice-form-grid">
            <label>Coluna<select value={columnId} onChange={(event) => setColumnId(event.target.value)}>{columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}</select></label>
            <label>Prioridade<select value={priority} onChange={(event) => setPriority(event.target.value as NoticePriority)}><option value="normal">Normal</option><option value="important">Importante</option><option value="urgent">Urgente</option></select></label>
            <label>Responsável<select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Sem responsável</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
            <label>Prazo<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          </div>
          <fieldset><legend>Etiquetas</legend><div className="notice-label-picker">{(Object.keys(NOTICE_LABELS) as NoticeLabel[]).map((label) => <button
            key={label} type="button" aria-pressed={labels.includes(label)}
            onClick={() => setLabels((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label])}
            className={`notice-label ${NOTICE_LABELS[label].className} ${labels.includes(label) ? "is-selected" : ""}`}
          >{NOTICE_LABELS[label].label}</button>)}</div></fieldset>
          {card && <div className="notice-order-controls" aria-label="Reordenar cartão">
            <button type="button" onClick={() => void onReorder(-1)}><ArrowUp aria-hidden="true" />Subir</button>
            <button type="button" onClick={() => void onReorder(1)}><ArrowDown aria-hidden="true" />Descer</button>
          </div>}
        </form>

        {card && <aside className="notice-activity-panel">
          {loadingDetails ? <div className="notice-loading"><Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Carregando atividade…</div> : <>
            <section><h3><MessageSquare aria-hidden="true" />Comentários</h3><div className="notice-comment-compose"><textarea aria-label="Novo comentário" rows={3} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Escreva um comentário" /><button type="button" disabled={saving || !comment.trim()} onClick={() => void addComment()}>Comentar</button></div>
              <div className="notice-activity-list">{details.comments.map((item) => <article key={item.id}><strong>{profileNames.get(item.author_id) || "Usuário"}</strong><time>{new Date(item.created_at).toLocaleString("pt-BR")}</time><p>{item.body}</p></article>)}{!details.comments.length && <p className="notice-empty-activity">Nenhum comentário.</p>}</div>
            </section>
            <section><h3><Paperclip aria-hidden="true" />Anexos</h3><input ref={fileRef} className="sr-only" type="file" onChange={(event) => void upload(event.target.files?.[0])} /><button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="notice-upload-button">{uploading ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Upload aria-hidden="true" />}Anexar arquivo <small>até 10 MB</small></button>
              <div className="notice-attachment-list">{details.attachments.map((item) => <button key={item.id} type="button" onClick={() => void openAttachment(item.storage_path)}><Download aria-hidden="true" /><span>{item.file_name}<small>{Math.max(1, Math.round(item.size_bytes / 1024))} KB</small></span></button>)}{!details.attachments.length && <p className="notice-empty-activity">Nenhum anexo.</p>}</div>
            </section>
            <section><h3><History aria-hidden="true" />Histórico</h3><ol className="notice-history-list">{details.history.map((item) => <li key={item.id}><Clock3 aria-hidden="true" /><span><strong>{HISTORY_LABELS[item.action]}</strong><small>{profileNames.get(item.actor_id || "") || "Sistema"} · {new Date(item.created_at).toLocaleString("pt-BR")}</small></span></li>)}</ol></section>
          </>}
        </aside>}
      </div>
      <footer className="notice-dialog-footer"><button type="button" onClick={onClose} disabled={saving || uploading}>Cancelar</button><button type="submit" form="notice-card-form" disabled={saving}>{saving ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <Save aria-hidden="true" />}{card ? "Salvar alterações" : "Criar cartão"}</button></footer>
    </section>
  </div>;
}
