import { createClient } from "@/lib/supabase/client";
import { boardOrders } from "@/lib/notice-board/board";
import type {
  NoticeAttachment,
  NoticeBoardData,
  NoticeCard,
  NoticeCardDetails,
  NoticeCardInput,
  NoticeColumn,
  NoticeComment,
  NoticeHistory,
} from "@/lib/notice-board/types";
import type { Profile } from "@/types/database";

const CARD_FIELDS = "id,column_id,title,description,priority,assignee_id,labels,due_date,position,created_by,created_at,updated_at";

export const noticeBoardService = {
  async loadBoard(): Promise<NoticeBoardData> {
    const supabase = createClient();
    const [columnsResult, cardsResult, profilesResult] = await Promise.all([
      supabase.from("notice_board_columns").select("id,key,title,position,color").order("position"),
      supabase.from("notice_board_cards").select(CARD_FIELDS).is("archived_at", null).order("position"),
      supabase.from("profiles").select("id,name,email,role,base_id,created_at,updated_at").order("name"),
    ]);
    if (columnsResult.error) throw columnsResult.error;
    if (cardsResult.error) throw cardsResult.error;
    if (profilesResult.error) throw profilesResult.error;
    return {
      columns: (columnsResult.data || []) as NoticeColumn[],
      cards: (cardsResult.data || []) as NoticeCard[],
      profiles: (profilesResult.data || []) as Profile[],
    };
  },

  async loadCardDetails(cardId: string): Promise<NoticeCardDetails> {
    const supabase = createClient();
    const [commentsResult, attachmentsResult, historyResult] = await Promise.all([
      supabase.from("notice_board_comments").select("id,card_id,author_id,body,created_at").eq("card_id", cardId).order("created_at"),
      supabase.from("notice_board_attachments").select("id,card_id,uploaded_by,file_name,storage_path,mime_type,size_bytes,created_at").eq("card_id", cardId).order("created_at"),
      supabase.from("notice_board_history").select("id,card_id,actor_id,action,details,created_at").eq("card_id", cardId).order("created_at", { ascending: false }).limit(100),
    ]);
    if (commentsResult.error) throw commentsResult.error;
    if (attachmentsResult.error) throw attachmentsResult.error;
    if (historyResult.error) throw historyResult.error;
    return {
      comments: (commentsResult.data || []) as NoticeComment[],
      attachments: (attachmentsResult.data || []) as NoticeAttachment[],
      history: (historyResult.data || []) as NoticeHistory[],
    };
  },

  async createCard(input: NoticeCardInput, userId: string, position: number) {
    const { data, error } = await createClient().from("notice_board_cards")
      .insert({ ...input, created_by: userId, position })
      .select(CARD_FIELDS).single();
    if (error) throw error;
    return data as NoticeCard;
  },

  async updateCard(cardId: string, input: NoticeCardInput, expectedUpdatedAt: string) {
    const { data, error } = await createClient().from("notice_board_cards")
      .update(input).eq("id", cardId).eq("updated_at", expectedUpdatedAt).select(CARD_FIELDS).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Este cartão foi alterado por outro analista. Feche e abra novamente para conferir a versão atual.");
    return data as NoticeCard;
  },

  async reorder(columns: NoticeColumn[], cards: NoticeCard[]) {
    const { error } = await createClient().rpc("reorder_notice_board_cards", { p_orders: boardOrders(columns, cards) });
    if (error) throw error;
  },

  async addComment(cardId: string, authorId: string, body: string) {
    const { error } = await createClient().from("notice_board_comments").insert({ card_id: cardId, author_id: authorId, body });
    if (error) throw error;
  },

  async uploadAttachment(cardId: string, userId: string, file: File) {
    if (file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error("O anexo deve ter no máximo 10 MB.");
    const supabase = createClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "anexo";
    const path = `${cardId}/${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from("notice-board-attachments").upload(path, file, { upsert: false });
    if (upload.error) throw upload.error;
    const { error } = await supabase.from("notice_board_attachments").insert({
      card_id: cardId, uploaded_by: userId, file_name: file.name.slice(0, 255), storage_path: path,
      mime_type: file.type || null, size_bytes: file.size,
    });
    if (error) {
      await supabase.storage.from("notice-board-attachments").remove([path]);
      throw error;
    }
  },

  async attachmentUrl(path: string) {
    const { data, error } = await createClient().storage.from("notice-board-attachments").createSignedUrl(path, 60);
    if (error) throw error;
    return data.signedUrl;
  },
};
