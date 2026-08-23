export const RATING_FIELDS = [
  "meaning_preservation_1_to_5",
  "fluency_1_to_5",
] as const;

export const FLAG_FIELD = "factual_or_polarity_error" as const;

export type RatingField = (typeof RATING_FIELDS)[number];
export type Rating = "" | "1" | "2" | "3" | "4" | "5";
export type AuditFlag = "unset" | "error" | "correct";
export type ReviewStatus = "empty" | "partial" | "complete";
export type ReviewFilter = "all" | "open" | "complete" | "errors";

export interface AuditRecord {
  [key: string]: string;
  review_id: string;
  language: string;
  candidate_text: string;
  meaning_preservation_1_to_5: string;
  fluency_1_to_5: string;
  factual_or_polarity_error: string;
  notes: string;
}

export interface AuditDocument {
  columns: string[];
  sourceColumn: "source_text" | "original_text";
  rows: AuditRecord[];
}

export interface AuditSummary {
  total: number;
  complete: number;
  partial: number;
  empty: number;
  errors: number;
  meaningMean: number | null;
  fluencyMean: number | null;
}

export function parseAuditFlag(value: string): AuditFlag {
  const normalized = value.trim().toLocaleLowerCase("it");
  if (["true", "1", "yes", "y", "sì", "si", "error"].includes(normalized)) {
    return "error";
  }
  if (["false", "0", "no", "n", "correct", "ok"].includes(normalized)) {
    return "correct";
  }
  return "unset";
}

export function isRating(value: string): value is Rating {
  return value === "" || ["1", "2", "3", "4", "5"].includes(value);
}

export function getReviewStatus(row: AuditRecord): ReviewStatus {
  const meaning = isRating(row.meaning_preservation_1_to_5)
    ? row.meaning_preservation_1_to_5
    : "";
  const fluency = isRating(row.fluency_1_to_5) ? row.fluency_1_to_5 : "";
  const flag = parseAuditFlag(row.factual_or_polarity_error);
  const completedFields =
    Number(Boolean(meaning)) +
    Number(Boolean(fluency)) +
    Number(flag !== "unset");

  if (completedFields === 3) return "complete";
  if (completedFields > 0 || row.notes.trim()) return "partial";
  return "empty";
}

export function matchesFilter(row: AuditRecord, filter: ReviewFilter): boolean {
  const status = getReviewStatus(row);
  if (filter === "open") return status !== "complete";
  if (filter === "complete") return status === "complete";
  if (filter === "errors")
    return parseAuditFlag(row.factual_or_polarity_error) === "error";
  return true;
}

export function summarizeAudit(rows: AuditRecord[]): AuditSummary {
  const statuses = rows.map(getReviewStatus);
  const completedRows = rows.filter(
    (row) => getReviewStatus(row) === "complete",
  );
  const meaning = completedRows.map((row) =>
    Number(row.meaning_preservation_1_to_5),
  );
  const fluency = completedRows.map((row) => Number(row.fluency_1_to_5));
  const mean = (values: number[]) =>
    values.length
      ? values.reduce((total, value) => total + value, 0) / values.length
      : null;

  return {
    total: rows.length,
    complete: statuses.filter((status) => status === "complete").length,
    partial: statuses.filter((status) => status === "partial").length,
    empty: statuses.filter((status) => status === "empty").length,
    errors: rows.filter(
      (row) => parseAuditFlag(row.factual_or_polarity_error) === "error",
    ).length,
    meaningMean: mean(meaning),
    fluencyMean: mean(fluency),
  };
}
