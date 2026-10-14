import type { Profile } from "@/types/database";

export type NoticePriority = "normal" | "important" | "urgent";
export type NoticeLabel = "operation" | "pending" | "safety" | "client" | "maintenance";

export interface NoticeColumn {
  id: string;
  key: string;
  title: string;
  position: number;
  color: "green" | "blue" | "amber" | "slate" | "violet";
}

export interface NoticeCard {
  id: string;
  column_id: string;
  title: string;
  description: string;
  priority: NoticePriority;
  assignee_id: string | null;
  labels: NoticeLabel[];
  due_date: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface NoticeComment {
  id: string;
  card_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface NoticeAttachment {
  id: string;
  card_id: string;
  uploaded_by: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
}

export interface NoticeHistory {
  id: string;
  card_id: string | null;
  actor_id: string | null;
  action: "created" | "updated" | "moved" | "commented" | "attached" | "deleted";
  details: Record<string, unknown>;
  created_at: string;
}

export interface NoticeBoardData {
  columns: NoticeColumn[];
  cards: NoticeCard[];
  profiles: Profile[];
}

export interface NoticeCardDetails {
  comments: NoticeComment[];
  attachments: NoticeAttachment[];
  history: NoticeHistory[];
}

export interface NoticeCardInput {
  title: string;
  description: string;
  priority: NoticePriority;
  assignee_id: string | null;
  labels: NoticeLabel[];
  due_date: string | null;
  column_id: string;
}
