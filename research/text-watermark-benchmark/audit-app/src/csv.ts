import {
  FLAG_FIELD,
  RATING_FIELDS,
  isRating,
  parseAuditFlag,
  type AuditDocument,
  type AuditRecord,
} from "./model";

const REQUIRED_COLUMNS = [
  "review_id",
  "language",
  "candidate_text",
  ...RATING_FIELDS,
  FLAG_FIELD,
  "notes",
] as const;

export class AuditCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditCsvError";
  }
}

function parseRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted)
    throw new AuditCsvError("Il CSV termina dentro un campo tra virgolette.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  while (rows.length && rows.at(-1)?.every((value) => value === "")) rows.pop();
  return rows;
}

function normalizeFlag(value: string, rowNumber: number): string {
  if (!value.trim()) return "";
  const flag = parseAuditFlag(value);
  if (flag === "unset") {
    throw new AuditCsvError(
      `Riga ${rowNumber}: “${FLAG_FIELD}” deve essere true, false oppure vuoto.`,
    );
  }
  return flag === "error" ? "true" : "false";
}

export function parseAuditCsv(input: string): AuditDocument {
  const parsed = parseRows(input.replace(/^\uFEFF/, ""));
  if (parsed.length < 2)
    throw new AuditCsvError("Il CSV non contiene record da revisionare.");

  const columns = parsed[0].map((column) => column.trim());
  const duplicates = columns.filter(
    (column, index) => columns.indexOf(column) !== index,
  );
  if (duplicates.length) {
    throw new AuditCsvError(
      `Intestazioni duplicate: ${[...new Set(duplicates)].join(", ")}.`,
    );
  }

  const missing = REQUIRED_COLUMNS.filter(
    (column) => !columns.includes(column),
  );
  if (missing.length)
    throw new AuditCsvError(`Colonne mancanti: ${missing.join(", ")}.`);

  const sourceColumn = columns.includes("source_text")
    ? "source_text"
    : columns.includes("original_text")
      ? "original_text"
      : null;
  if (!sourceColumn) {
    throw new AuditCsvError(
      "Manca la colonna del testo sorgente: source_text o original_text.",
    );
  }

  const identifiers = new Set<string>();
  const rows = parsed.slice(1).map((values, rowIndex) => {
    const rowNumber = rowIndex + 2;
    if (
      values.length > columns.length &&
      values.slice(columns.length).some(Boolean)
    ) {
      throw new AuditCsvError(
        `Riga ${rowNumber}: ci sono più valori che intestazioni.`,
      );
    }

    const entries = columns.map((column, index) => [
      column,
      values[index] ?? "",
    ]);
    const row = Object.fromEntries(entries) as AuditRecord;

    if (!row.review_id.trim())
      throw new AuditCsvError(`Riga ${rowNumber}: review_id è vuoto.`);
    if (identifiers.has(row.review_id)) {
      throw new AuditCsvError(
        `Riga ${rowNumber}: review_id duplicato “${row.review_id}”.`,
      );
    }
    identifiers.add(row.review_id);

    if (!row.language.trim())
      throw new AuditCsvError(`Riga ${rowNumber}: language è vuoto.`);
    if (!row[sourceColumn].trim())
      throw new AuditCsvError(`Riga ${rowNumber}: il testo sorgente è vuoto.`);
    if (!row.candidate_text.trim()) {
      throw new AuditCsvError(`Riga ${rowNumber}: candidate_text è vuoto.`);
    }

    for (const fieldName of RATING_FIELDS) {
      row[fieldName] = row[fieldName].trim();
      if (!isRating(row[fieldName])) {
        throw new AuditCsvError(
          `Riga ${rowNumber}: “${fieldName}” deve essere tra 1 e 5.`,
        );
      }
    }
    row[FLAG_FIELD] = normalizeFlag(row[FLAG_FIELD], rowNumber);
    return row;
  });

  return { columns, sourceColumn, rows };
}

function escapeField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

export function serializeAuditCsv(document: AuditDocument): string {
  const lines = [
    document.columns.map(escapeField).join(","),
    ...document.rows.map((row) =>
      document.columns
        .map((column) => escapeField(row[column] ?? ""))
        .join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function reviewedFileName(fileName: string): string {
  const base = fileName.replace(/\.csv$/i, "") || "manual-audit";
  return `${base}.reviewed.csv`;
}
