import { describe, expect, it } from "vitest";
import {
  getReviewStatus,
  matchesFilter,
  parseAuditFlag,
  summarizeAudit,
  type AuditRecord,
} from "../src/model";

function row(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    review_id: "audit-00001",
    language: "it",
    source_text: "Sorgente",
    candidate_text: "Candidato",
    meaning_preservation_1_to_5: "",
    fluency_1_to_5: "",
    factual_or_polarity_error: "",
    notes: "",
    ...overrides,
  };
}

describe("audit model", () => {
  it("requires both ratings and the explicit factual flag for completion", () => {
    expect(getReviewStatus(row())).toBe("empty");
    expect(getReviewStatus(row({ meaning_preservation_1_to_5: "4" }))).toBe(
      "partial",
    );
    expect(
      getReviewStatus(
        row({
          meaning_preservation_1_to_5: "4",
          fluency_1_to_5: "5",
          factual_or_polarity_error: "false",
        }),
      ),
    ).toBe("complete");
  });

  it("normalizes common human boolean spellings", () => {
    expect(parseAuditFlag("Sì")).toBe("error");
    expect(parseAuditFlag("yes")).toBe("error");
    expect(parseAuditFlag("0")).toBe("correct");
    expect(parseAuditFlag("")).toBe("unset");
  });

  it("summarizes only complete ratings in score means", () => {
    const rows = [
      row({
        meaning_preservation_1_to_5: "5",
        fluency_1_to_5: "4",
        factual_or_polarity_error: "false",
      }),
      row({
        review_id: "audit-00002",
        meaning_preservation_1_to_5: "3",
        fluency_1_to_5: "2",
        factual_or_polarity_error: "true",
      }),
      row({ review_id: "audit-00003", meaning_preservation_1_to_5: "1" }),
    ];

    expect(summarizeAudit(rows)).toEqual({
      total: 3,
      complete: 2,
      partial: 1,
      empty: 0,
      errors: 1,
      meaningMean: 4,
      fluencyMean: 3,
    });
    expect(matchesFilter(rows[1], "errors")).toBe(true);
    expect(matchesFilter(rows[2], "open")).toBe(true);
  });
});
