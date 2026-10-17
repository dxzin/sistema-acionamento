import { canAutoApplyManualEnd, type JourneyPreview, type JourneyRecordSnapshot } from "./journey";
import type { SighraResult } from "./queries";

export type JourneyBatchJobStatus = "queued" | "running" | "completed" | "failed" | "expired";

export type JourneyBatchJob = {
  id: string;
  login: string;
  status: JourneyBatchJobStatus;
  created_at: string;
  since_date: string;
  result: SighraResult | null;
  error: string | null;
  simulation?: boolean;
};

export type JourneyBatchOutcome = "pending" | "safe" | "unchanged" | "review" | "failed";

export type JourneyBatchItem = {
  record: JourneyRecordSnapshot;
  job: JourneyBatchJob | null;
  preview: JourneyPreview | null;
  outcome: JourneyBatchOutcome;
};

export type JourneyBatchSummary = Record<JourneyBatchOutcome, number> & {
  total: number;
  completed: number;
};

export function journeyBatchOutcome(job: JourneyBatchJob | null, preview: JourneyPreview | null): JourneyBatchOutcome {
  if (!job || job.status === "queued" || job.status === "running") return "pending";
  if (job.status === "failed" || job.status === "expired") return "failed";
  if (!preview || preview.conflicts.length > 0) return "review";
  if (canAutoApplyManualEnd(preview)) return "safe";
  if (preview.resolution.status !== "safe") return "review";
  return preview.canApply ? "safe" : "unchanged";
}

export function summarizeJourneyBatch(items: JourneyBatchItem[]): JourneyBatchSummary {
  const summary: JourneyBatchSummary = {
    total: items.length,
    completed: 0,
    pending: 0,
    safe: 0,
    unchanged: 0,
    review: 0,
    failed: 0,
  };
  for (const item of items) summary[item.outcome]++;
  summary.completed = summary.total - summary.pending;
  return summary;
}

export function summarizeJourneyEndLocation(value: string | null | undefined) {
  if (!value?.trim()) return null;

  const parts = value
    .split("·")
    .map((part) => part.trim().replace(/\s+\/\s+/g, "/"))
    .filter(Boolean);

  if (parts.length <= 2) return parts.join(" · ");
  return `${parts[0]} · ${parts.at(-1)}`;
}

export function matchBatchJobs(records: JourneyRecordSnapshot[], jobs: JourneyBatchJob[]) {
  const remaining = [...jobs];
  return records.map((record) => {
    const index = remaining.findIndex((job) => normalizeLogin(job.login) === normalizeLogin(record.login));
    return index < 0 ? null : remaining.splice(index, 1)[0];
  });
}

const normalizeLogin = (value: string) => value.replace(/^0+(?=\d)/, "");
