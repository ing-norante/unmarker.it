import type { AuditDocument } from "./model";

const STORAGE_PREFIX = "unmarker-human-audit:v1";
const LAST_SESSION_KEY = `${STORAGE_PREFIX}:last`;

export interface AuditSession extends AuditDocument {
  id: string;
  fileName: string;
  importedAt: string;
  updatedAt: string;
  activeReviewId: string;
}

function sessionKey(identifier: string): string {
  return `${STORAGE_PREFIX}:session:${identifier}`;
}

export async function fingerprintCsv(contents: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(contents),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  let hash = 2166136261;
  for (let index = 0; index < contents.length; index += 1) {
    hash ^= contents.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fallback-${(hash >>> 0).toString(16)}`;
}

export function createSession(
  id: string,
  fileName: string,
  document: AuditDocument,
): AuditSession {
  const timestamp = new Date().toISOString();
  return {
    ...document,
    id,
    fileName,
    importedAt: timestamp,
    updatedAt: timestamp,
    activeReviewId: document.rows[0]?.review_id ?? "",
  };
}

export function loadSession(id: string): AuditSession | null {
  try {
    const serialized = localStorage.getItem(sessionKey(id));
    return serialized ? (JSON.parse(serialized) as AuditSession) : null;
  } catch {
    return null;
  }
}

export function loadLastSession(): AuditSession | null {
  try {
    const id = localStorage.getItem(LAST_SESSION_KEY);
    return id ? loadSession(id) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: AuditSession): boolean {
  try {
    localStorage.setItem(sessionKey(session.id), JSON.stringify(session));
    localStorage.setItem(LAST_SESSION_KEY, session.id);
    return true;
  } catch {
    return false;
  }
}
