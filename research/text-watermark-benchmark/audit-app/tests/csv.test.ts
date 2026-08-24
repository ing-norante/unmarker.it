import { describe, expect, it } from "vitest";
import {
  AuditCsvError,
  parseAuditCsv,
  reviewedFileName,
  serializeAuditCsv,
} from "../src/csv";

const manualHeader =
  "review_id,language,source_text,candidate_text,meaning_preservation_1_to_5,fluency_1_to_5,factual_or_polarity_error,notes";

describe("audit CSV", () => {
  it("parses quoted multiline text and escaped quotes", () => {
    const csv =
      `${manualHeader}\r\n` +
      'audit-00001,it,"Prima riga\nSeconda, riga","Testo con ""citazione""",5,4,false,"nota, breve"\r\n';

    const document = parseAuditCsv(csv);

    expect(document.sourceColumn).toBe("source_text");
    expect(document.rows).toHaveLength(1);
    expect(document.rows[0].source_text).toBe("Prima riga\nSeconda, riga");
    expect(document.rows[0].candidate_text).toBe('Testo con "citazione"');
    expect(document.rows[0].factual_or_polarity_error).toBe("false");
    expect(document.rows[0].notes).toBe("nota, breve");
  });

  it("accepts the report human-review source column and preserves extra columns", () => {
    const csv =
      "review_id,language,original_text,candidate_text,meaning_preservation_1_to_5,fluency_1_to_5,factual_or_polarity_error,notes,reviewer\n" +
      "review-00001,en,Original,Candidate,3,4,yes,Check this,Ada\n";

    const document = parseAuditCsv(csv);

    expect(document.sourceColumn).toBe("original_text");
    expect(document.rows[0].factual_or_polarity_error).toBe("true");
    expect(document.rows[0].reviewer).toBe("Ada");
    expect(document.columns.at(-1)).toBe("reviewer");
  });

  it("round-trips multiline notes without changing the audit contract", () => {
    const source = `${manualHeader}\nreview-1,en,"A, B",Candidate,1,2,true,"Line one\nLine ""two"""\n`;
    const parsed = parseAuditCsv(source);
    const reparsed = parseAuditCsv(serializeAuditCsv(parsed));

    expect(reparsed).toEqual(parsed);
  });

  it("imports and exports the adjudication contract without altering reviewer votes", () => {
    const header = [
      "adjudication_id",
      "primary_review_id",
      "language",
      "source_text",
      "candidate_text",
      "reviewer_1_meaning",
      "reviewer_2_meaning",
      "adjudicated_meaning_1_to_5",
      "reviewer_1_fluency",
      "reviewer_2_fluency",
      "adjudicated_fluency_1_to_5",
      "reviewer_1_factual_or_polarity_error",
      "reviewer_2_factual_or_polarity_error",
      "adjudicated_factual_or_polarity_error",
      "adjudication_notes",
    ].join(",");
    const csv = `${header}\nadjudication-00001,audit-00042,en,Source,Candidate,4,5,,3,5,,false,false,,\n`;

    const document = parseAuditCsv(csv);
    expect(document.mode).toBe("adjudication");
    expect(document.rows[0].review_id).toBe("adjudication-00001");
    expect(document.rows[0].reviewer_1_meaning).toBe("4");

    document.rows[0].meaning_preservation_1_to_5 = "5";
    document.rows[0].fluency_1_to_5 = "4";
    document.rows[0].factual_or_polarity_error = "false";
    document.rows[0].notes = "Decisione finale";
    const exported = parseAuditCsv(serializeAuditCsv(document));

    expect(exported.rows[0].meaning_preservation_1_to_5).toBe("5");
    expect(exported.rows[0].fluency_1_to_5).toBe("4");
    expect(exported.rows[0].adjudicated_factual_or_polarity_error).toBe(
      "false",
    );
    expect(exported.rows[0].reviewer_1_meaning).toBe("4");
    expect(exported.rows[0].notes).toBe("Decisione finale");
  });

  it("rejects malformed ratings and duplicate identifiers", () => {
    const invalidRating = `${manualHeader}\na,it,Source,Candidate,6,2,false,\n`;
    expect(() => parseAuditCsv(invalidRating)).toThrow(AuditCsvError);
    expect(() => parseAuditCsv(invalidRating)).toThrow("deve essere tra 1 e 5");

    const duplicate = `${manualHeader}\na,it,One,Candidate,,,,\na,en,Two,Candidate,,,,\n`;
    expect(() => parseAuditCsv(duplicate)).toThrow("review_id duplicato");
  });

  it("builds an explicit reviewed filename", () => {
    expect(reviewedFileName("manual-audit.csv")).toBe(
      "manual-audit.reviewed.csv",
    );
    expect(reviewedFileName("audit.CSV")).toBe("audit.reviewed.csv");
  });
});
