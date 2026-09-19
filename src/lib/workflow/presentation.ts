import { message, type MessageDescriptor } from "@/i18n/messages";
import type { BatchItem, BatchSnapshot, BatchStatus } from "@/lib/batch/queue";
import type {
  ImageAuditResult,
  VisibleWatermarkStatus,
  WorkflowPhase,
} from "@/lib/types";

const batchStates = {
  waiting: {
    phase: "idle",
    pending: true,
    retryable: false,
    badge: "secondary",
  },
  running: {
    phase: "preflight-scanning",
    pending: true,
    retryable: false,
    badge: "secondary",
  },
  completed: {
    phase: "complete",
    pending: false,
    retryable: true,
    badge: "default",
  },
  "completed-with-warnings": {
    phase: "complete",
    pending: false,
    retryable: true,
    badge: "secondary",
  },
  "analysis-only": {
    phase: "analysis-only",
    pending: false,
    retryable: true,
    badge: "secondary",
  },
  failed: {
    phase: "error",
    pending: false,
    retryable: true,
    badge: "destructive",
  },
  cancelled: {
    phase: "cancelled",
    pending: false,
    retryable: true,
    badge: "secondary",
  },
  rejected: {
    phase: "error",
    pending: false,
    retryable: false,
    badge: "destructive",
  },
} as const satisfies Record<
  BatchStatus,
  { phase: WorkflowPhase; pending: boolean; retryable: boolean; badge: string }
>;

export function presentBatchItem(item: BatchItem) {
  const state = batchStates[item.status];
  return {
    ...state,
    phase:
      item.status === "running"
        ? (item.progress?.phase ?? state.phase)
        : state.phase,
    status: message(`workflow:batch.status.${item.status}`),
    preflight: item.result?.preflight ?? item.progress?.preflight ?? null,
    output: item.result?.output ?? null,
    hasWarnings: Boolean(item.result?.warnings.length),
    verificationFailed: Boolean(
      item.result?.output &&
      item.result.postflight.metadataScan === null &&
      !visibleStates[item.result.postflight.visibleWatermark.status].checked,
    ),
  };
}

export function presentBatch(snapshot: BatchSnapshot) {
  const waiting = snapshot.items.some((item) => item.status === "waiting");
  const active = snapshot.items.find((item) => item.id === snapshot.activeId);
  const pending = snapshot.items.some(
    (item) => batchStates[item.status].pending,
  );
  const ready = snapshot.items.filter((item) => item.result?.output).length;
  return {
    active,
    waiting,
    pending,
    ready,
    finished: snapshot.items.filter((item) => !batchStates[item.status].pending)
      .length,
    outputBytes: snapshot.items.reduce(
      (sum, item) => sum + (item.result?.output?.size ?? 0),
      0,
    ),
    canExport: ready > 0 && !snapshot.activeId && !snapshot.operationLocked,
    canReset: !pending && !snapshot.operationLocked,
    canToggleQueue: (waiting || Boolean(active)) && !snapshot.operationLocked,
    canCleanMetadata: !snapshot.activeId && !snapshot.operationLocked,
  };
}

export type SignalTone = "ok" | "warning" | "danger" | "neutral";
const visibleStates = {
  detected: { key: "detected", tone: "danger", checked: true },
  "not-detected": { key: "clear", tone: "ok", checked: true },
  "not-scanned": { key: "notScanned", tone: "neutral", checked: false },
  "scan-failed": { key: "failed", tone: "warning", checked: false },
} as const satisfies Record<
  VisibleWatermarkStatus,
  { key: string; tone: SignalTone; checked: boolean }
>;

export function presentVisible(status: VisibleWatermarkStatus) {
  const state = visibleStates[status];
  return {
    ...state,
    label: message(`workflow:audit.visible.${state.key}.label`),
    description: message(`workflow:audit.visible.${state.key}.description`),
    verification: message(`workflow:verification.status.${status}`),
  };
}

export function presentVerification(postflight: ImageAuditResult | null) {
  const visibleChecked = Boolean(
    postflight && visibleStates[postflight.visibleWatermark.status].checked,
  );
  const metadataChecked = Boolean(
    postflight?.metadataScan && postflight.metadataScan.warnings.length === 0,
  );
  return {
    visibleChecked,
    metadataChecked,
    checksComplete:
      visibleChecked && metadataChecked && postflight?.warnings.length === 0,
  };
}

export function signalCount(count: number | null): MessageDescriptor {
  return count === null
    ? message("workflow:verification.partial")
    : message("workflow:verification.signal", { count });
}

const resultPanels = {
  idle: false,
  "preflight-scanning": false,
  "analysis-only": false,
  processing: true,
  "postflight-scanning": true,
  complete: true,
  error: false,
  cancelled: false,
} satisfies Record<WorkflowPhase, boolean>;
export function showsResultPanel(phase: WorkflowPhase) {
  return resultPanels[phase];
}
