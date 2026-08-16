import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { useUnmarkPipeline } from "@/hooks/useUnmarkPipeline";
import { triggerBrowserDownload } from "@/lib/download";
import {
  canCleanMetadata,
  cleanImageMetadata,
  scanImageMetadata,
} from "@/lib/metadataCleaner";
import { withObjectUrl } from "@/lib/objectUrl";
import { buildImageAudit } from "@/lib/imageAudit";
import {
  inspectBrowserImageDecode,
  isMetadataFileCandidate,
  validateWorkflowFile,
} from "@/lib/fileValidation";
import { detectGeminiVisibleWatermark } from "@/lib/geminiWorkerClient";
import { trackAction } from "@/lib/analytics";
import type {
  GeminiDetectionResult,
  ImageAuditResult,
  ImageWorkflowCapabilities,
  ImageWorkflowState,
  StatusMessage,
  WorkflowPhase,
} from "@/lib/types";
import { message, type MessageDescriptor } from "@/i18n/messages";
import { useTranslation } from "react-i18next";

type SetStatusMessage = (message: StatusMessage | null) => void;

interface UseImageWorkflowOptions {
  setStatusMessage: SetStatusMessage;
}

const EMPTY_CAPABILITIES: ImageWorkflowCapabilities = {
  canProcess: false,
  canCleanMetadata: false,
};

export function useImageWorkflow({
  setStatusMessage,
}: UseImageWorkflowOptions) {
  const { t } = useTranslation("workflow");
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [phase, setPhase] = useState<WorkflowPhase>("idle");
  const [preflightAudit, setPreflightAudit] = useState<ImageAuditResult | null>(
    null,
  );
  const [postflightAudit, setPostflightAudit] =
    useState<ImageAuditResult | null>(null);
  const [detectionHint, setDetectionHint] =
    useState<GeminiDetectionResult | null>(null);
  const [capabilities, setCapabilities] =
    useState<ImageWorkflowCapabilities>(EMPTY_CAPABILITIES);
  const [workflowWarnings, setWorkflowWarnings] = useState<MessageDescriptor[]>(
    [],
  );
  const [isMetadataCleaning, setIsMetadataCleaning] = useState(false);
  const {
    url: originalImageUrl,
    setObjectUrl: setOriginalObjectUrl,
    clearObjectUrl: clearOriginalObjectUrl,
  } = useObjectUrl();
  const {
    url: metadataCleanUrl,
    setObjectUrl: setMetadataCleanObjectUrl,
    clearObjectUrl: clearMetadataCleanObjectUrl,
  } = useObjectUrl();

  const pipeline = useUnmarkPipeline({
    originalImage,
    setStatusMessage,
  });

  const workflowJobRef = useRef(0);
  const workflowIdRef = useRef<string | null>(null);
  const workflowStartedAtRef = useRef<number | null>(null);
  const processingAttemptRef = useRef(0);
  const preflightValidRef = useRef(false);
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  const clearWorkflowState = useCallback(() => {
    workflowJobRef.current += 1;
    activeAbortControllerRef.current?.abort();
    activeAbortControllerRef.current = null;
    workflowIdRef.current = null;
    workflowStartedAtRef.current = null;
    processingAttemptRef.current = 0;
    preflightValidRef.current = false;
    pipeline.resetPipeline();
    clearOriginalObjectUrl();
    clearMetadataCleanObjectUrl();
    setOriginalImage(null);
    setPhase("idle");
    setPreflightAudit(null);
    setPostflightAudit(null);
    setDetectionHint(null);
    setCapabilities(EMPTY_CAPABILITIES);
    setWorkflowWarnings([]);
    setStatusMessage(null);
  }, [
    clearMetadataCleanObjectUrl,
    clearOriginalObjectUrl,
    pipeline,
    setStatusMessage,
  ]);

  const setWorkflowError = useCallback(
    (
      title: MessageDescriptor,
      description: MessageDescriptor,
      stage: "validation" | "preflight",
      reasonCode: string,
    ) => {
      setPhase("error");
      setStatusMessage({
        variant: "destructive",
        title,
        description,
      });
      trackAction("workflow_error", "workflow", {
        workflow_id: workflowIdRef.current,
        stage,
        reason_code: reasonCode,
      });
    },
    [setStatusMessage],
  );

  const runPostflight = useCallback(
    async (blob: Blob, fileName: string, jobId: number) => {
      const jpegFile = new File([blob], fileName, { type: "image/jpeg" });
      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;

      const metadataPromise = scanImageMetadata(jpegFile);
      const visiblePromise = loadImageDataFromFile(
        jpegFile,
        abortController.signal,
      ).then((imageData) =>
        detectGeminiVisibleWatermark(imageData, {
          signal: abortController.signal,
        }),
      );

      const [metadataResult, visibleResult] = await Promise.allSettled([
        metadataPromise,
        visiblePromise,
      ]);

      if (workflowJobRef.current !== jobId || abortController.signal.aborted) {
        throw createAbortError();
      }

      if (activeAbortControllerRef.current === abortController) {
        activeAbortControllerRef.current = null;
      }

      const warnings: MessageDescriptor[] = [];
      const metadataScan =
        metadataResult.status === "fulfilled" ? metadataResult.value : null;
      const visibleDetection =
        visibleResult.status === "fulfilled" ? visibleResult.value : null;

      if (metadataResult.status === "rejected") {
        warnings.push(message("workflow:warnings.postflightMetadata"));
      }

      if (visibleResult.status === "rejected") {
        warnings.push(message("workflow:warnings.postflightVisible"));
      }

      return buildImageAudit({
        stage: "postflight",
        metadataScan,
        visibleDetection,
        visibleScanStatus:
          visibleResult.status === "rejected" ? "failed" : "scanned",
        warnings,
      });
    },
    [],
  );

  const runProcessing = useCallback(
    async (
      file: File,
      audit: ImageAuditResult,
      hint: GeminiDetectionResult | null,
      jobId = ++workflowJobRef.current,
      trigger: "initial" | "retry" | "reprocess" = "initial",
    ) => {
      const attempt = ++processingAttemptRef.current;
      const processingStartedAt = performance.now();
      setPhase("processing");
      setPostflightAudit(null);
      setWorkflowWarnings([]);
      trackAction("processing_started", "workflow", {
        workflow_id: workflowIdRef.current,
        attempt,
        trigger,
      });

      const result = await pipeline.processPipeline({
        file,
        detectionHint: hint,
      });

      if (workflowJobRef.current !== jobId) {
        return;
      }

      if (!result.ok) {
        if (result.reason === "cancelled") {
          setPhase("cancelled");
          trackAction("workflow_cancelled", "workflow", {
            workflow_id: workflowIdRef.current,
            attempt,
            phase: "processing",
            trigger,
          });
          return;
        }

        setPhase("error");
        trackAction("workflow_error", "workflow", {
          workflow_id: workflowIdRef.current,
          attempt,
          stage: "processing",
          reason_code: "pipeline_failed",
          trigger,
        });
        return;
      }

      trackAction("processing_complete", "workflow", {
        workflow_id: workflowIdRef.current,
        attempt,
        duration_ms: Math.round(performance.now() - processingStartedAt),
        trigger,
      });
      setPhase("postflight-scanning");
      const postflightStartedAt = performance.now();

      try {
        const postAudit = await runPostflight(
          result.blob,
          result.fileName,
          jobId,
        );

        if (workflowJobRef.current !== jobId) {
          return;
        }

        setPreflightAudit(audit);
        setPostflightAudit(postAudit);
        setWorkflowWarnings(postAudit.warnings);
        setPhase("complete");
        const outcome =
          postAudit.warnings.length > 0
            ? "completed_with_warnings"
            : "completed";
        trackAction("postflight_complete", "workflow", {
          workflow_id: workflowIdRef.current,
          attempt,
          duration_ms: Math.round(performance.now() - postflightStartedAt),
          outcome,
          trigger,
        });
        trackAction("workflow_completed", "workflow", {
          workflow_id: workflowIdRef.current,
          attempt,
          duration_ms: elapsedWorkflowMs(workflowStartedAtRef.current),
          outcome:
            outcome === "completed" ? "processed" : "processed_with_warnings",
          trigger,
        });
      } catch (error) {
        if (isAbortError(error) || workflowJobRef.current !== jobId) {
          return;
        }

        setPreflightAudit(audit);
        setPostflightAudit(null);
        setWorkflowWarnings([
          message("workflow:warnings.postflightMetadata"),
          message("workflow:warnings.postflightVisible"),
        ]);
        setPhase("complete");
        trackAction("postflight_complete", "workflow", {
          workflow_id: workflowIdRef.current,
          attempt,
          duration_ms: Math.round(performance.now() - postflightStartedAt),
          outcome: "verification_failed",
          trigger,
        });
        trackAction("workflow_completed", "workflow", {
          workflow_id: workflowIdRef.current,
          attempt,
          duration_ms: elapsedWorkflowMs(workflowStartedAtRef.current),
          outcome: "processed_with_verification_failure",
          trigger,
        });
      }
    },
    [pipeline, runPostflight],
  );

  const runPreflight = useCallback(
    async (file: File, trigger: "initial" | "retry" = "initial") => {
      const jobId = ++workflowJobRef.current;
      const preflightStartedAt = performance.now();
      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;
      preflightValidRef.current = false;

      setPhase("preflight-scanning");
      setPreflightAudit(null);
      setPostflightAudit(null);
      setDetectionHint(null);
      setCapabilities(EMPTY_CAPABILITIES);
      setWorkflowWarnings([]);
      setStatusMessage(null);
      trackAction("preflight_started", "workflow", {
        workflow_id: workflowIdRef.current,
        trigger,
      });

      try {
        const metadataPromise = scanImageMetadata(file);
        const decodePromise = inspectBrowserImageDecode(file);
        const [metadataScan, decodeResult] = await Promise.all([
          metadataPromise,
          decodePromise,
        ]);

        if (
          workflowJobRef.current !== jobId ||
          abortController.signal.aborted
        ) {
          return;
        }

        let imageData: ImageData | null = null;
        let visibleDetection: GeminiDetectionResult | null = null;
        let visibleScanStatus: "scanned" | "not-scanned" | "failed" =
          "not-scanned";
        const warnings: MessageDescriptor[] = [];
        const hasMetadataOnlyPath =
          isMetadataFileCandidate(file) || decodeResult.reason === "too-large";

        if (decodeResult.canDecode) {
          try {
            imageData = await loadImageDataFromFile(
              file,
              abortController.signal,
            );
            visibleDetection = await detectGeminiVisibleWatermark(imageData, {
              signal: abortController.signal,
            });
            visibleScanStatus = "scanned";
          } catch (error) {
            if (isAbortError(error) || abortController.signal.aborted) {
              return;
            }

            visibleScanStatus = "failed";
            warnings.push(message("workflow:warnings.visibleScan"));
          }
        }

        if (
          workflowJobRef.current !== jobId ||
          abortController.signal.aborted
        ) {
          return;
        }

        if (!decodeResult.canDecode && !hasMetadataOnlyPath) {
          preflightValidRef.current = false;
          setWorkflowError(
            message("workflow:messages.decodeFailed.title"),
            message("workflow:messages.decodeFailed.description"),
            "preflight",
            "decode_failed",
          );
          return;
        }

        if (decodeResult.statusMessage) {
          warnings.push(decodeResult.statusMessage.description);
        }

        const audit = buildImageAudit({
          stage: "preflight",
          metadataScan,
          visibleDetection,
          visibleScanStatus: decodeResult.canDecode
            ? visibleScanStatus
            : "not-scanned",
          warnings,
        });
        const nextCapabilities = {
          canProcess: decodeResult.canDecode,
          canCleanMetadata: canCleanMetadata(metadataScan),
        };

        preflightValidRef.current = true;
        setPreflightAudit(audit);
        setDetectionHint(visibleDetection?.detected ? visibleDetection : null);
        setCapabilities(nextCapabilities);
        setWorkflowWarnings(warnings);
        trackAction("preflight_complete", "workflow", {
          workflow_id: workflowIdRef.current,
          can_process: nextCapabilities.canProcess,
          can_clean_metadata: nextCapabilities.canCleanMetadata,
          duration_ms: Math.round(performance.now() - preflightStartedAt),
          trigger,
        });

        if (!decodeResult.canDecode) {
          setPhase("analysis-only");
          trackAction("analysis_only", "workflow", {
            workflow_id: workflowIdRef.current,
            duration_ms: elapsedWorkflowMs(workflowStartedAtRef.current),
            trigger,
          });
          trackAction("workflow_completed", "workflow", {
            workflow_id: workflowIdRef.current,
            duration_ms: elapsedWorkflowMs(workflowStartedAtRef.current),
            outcome: "analysis_only",
            trigger,
          });
          return;
        }

        await runProcessing(
          file,
          audit,
          visibleDetection?.detected ? visibleDetection : null,
          jobId,
          trigger,
        );
      } catch (error) {
        if (isAbortError(error) || workflowJobRef.current !== jobId) {
          return;
        }

        console.error("Preflight failed", error);
        preflightValidRef.current = false;
        setWorkflowError(
          message("workflow:messages.analyzeFailed.title"),
          message("workflow:messages.analyzeFailed.description"),
          "preflight",
          "preflight_failed",
        );
      } finally {
        if (activeAbortControllerRef.current === abortController) {
          activeAbortControllerRef.current = null;
        }
      }
    },
    [runProcessing, setStatusMessage, setWorkflowError],
  );

  const selectImage = useCallback(
    (file: File) => {
      const validation = validateWorkflowFile(file);
      if (!validation.ok) {
        setStatusMessage(validation.statusMessage);
        trackAction("workflow_validation_failed", "workflow", {
          reason_code: validation.statusMessage.title.key,
        });
        return;
      }

      clearWorkflowState();
      workflowIdRef.current = createWorkflowId();
      workflowStartedAtRef.current = performance.now();
      setOriginalImage(file);
      setOriginalObjectUrl(file);
      trackAction("workflow_started", "workflow", {
        workflow_id: workflowIdRef.current,
        trigger: "initial",
      });
      void runPreflight(file, "initial");
    },
    [clearWorkflowState, runPreflight, setOriginalObjectUrl, setStatusMessage],
  );

  const cancel = useCallback(() => {
    const wasPreflight = phase === "preflight-scanning";
    const wasPostflight = phase === "postflight-scanning";

    workflowJobRef.current += 1;
    activeAbortControllerRef.current?.abort();
    activeAbortControllerRef.current = null;
    pipeline.cancelProcessing();

    if (wasPostflight) {
      pipeline.resetPipeline();
      setPostflightAudit(null);
    }

    if (wasPreflight) {
      preflightValidRef.current = false;
      setPreflightAudit(null);
      setDetectionHint(null);
      setCapabilities(EMPTY_CAPABILITIES);
    }

    setPhase("cancelled");
    setStatusMessage({
      variant: "default",
      title: message("workflow:messages.workflowCancelled.title"),
      description: message("workflow:messages.workflowCancelled.description"),
    });
    trackAction("workflow_cancelled", "workflow", {
      workflow_id: workflowIdRef.current,
      phase,
    });
  }, [phase, pipeline, setStatusMessage]);

  const retry = useCallback(() => {
    if (!originalImage) return;

    setStatusMessage(null);

    if (
      preflightValidRef.current &&
      preflightAudit &&
      capabilities.canProcess
    ) {
      trackAction("process_image", "action_bar", {
        workflow_id: workflowIdRef.current,
        retry_stage: "processing",
      });
      void runProcessing(
        originalImage,
        preflightAudit,
        detectionHint,
        undefined,
        "retry",
      );
      return;
    }

    trackAction("process_image", "action_bar", {
      workflow_id: workflowIdRef.current,
      retry_stage: "preflight",
    });
    void runPreflight(originalImage, "retry");
  }, [
    capabilities.canProcess,
    detectionHint,
    originalImage,
    preflightAudit,
    runPreflight,
    runProcessing,
    setStatusMessage,
  ]);

  const reprocess = useCallback(() => {
    if (!originalImage || !preflightAudit || !capabilities.canProcess) return;

    trackAction("reprocess_started", "workflow", {
      workflow_id: workflowIdRef.current,
      next_attempt: processingAttemptRef.current + 1,
    });
    setStatusMessage(null);
    void runProcessing(
      originalImage,
      preflightAudit,
      detectionHint,
      undefined,
      "reprocess",
    );
  }, [
    capabilities.canProcess,
    detectionHint,
    originalImage,
    preflightAudit,
    runProcessing,
    setStatusMessage,
  ]);

  const downloadMetadataClean = useCallback(async () => {
    if (
      !originalImage ||
      !preflightAudit?.metadataScan ||
      !capabilities.canCleanMetadata ||
      isMetadataCleaning
    ) {
      return;
    }

    setIsMetadataCleaning(true);
    clearMetadataCleanObjectUrl();

    try {
      const result = await cleanImageMetadata(originalImage);
      if (result.removedCount === 0) {
        setStatusMessage({
          variant: "default",
          title: message("workflow:messages.cleanupNone.title"),
          description: message("workflow:messages.cleanupNone.description"),
        });
        toast(t("toasts.cleanupNone"));
        return;
      }

      const objectUrl = setMetadataCleanObjectUrl(result.blob);
      if (objectUrl) {
        triggerBrowserDownload(objectUrl, result.fileName);
      }

      trackAction("download_metadata_clean", "workflow", {
        workflow_id: workflowIdRef.current,
      });
      toast.success(t("toasts.cleanDownloaded"));
    } catch (error) {
      console.error("Metadata clean failed", error);
      setStatusMessage({
        variant: "destructive",
        title: message("workflow:messages.cleanupFailed.title"),
        description: message("workflow:messages.cleanupFailed.description"),
      });
      toast.error(t("toasts.cleanupFailed"));
    } finally {
      setIsMetadataCleaning(false);
    }
  }, [
    capabilities.canCleanMetadata,
    clearMetadataCleanObjectUrl,
    isMetadataCleaning,
    originalImage,
    preflightAudit?.metadataScan,
    setMetadataCleanObjectUrl,
    setStatusMessage,
    t,
  ]);

  useEffect(() => {
    return () => {
      workflowJobRef.current += 1;
      activeAbortControllerRef.current?.abort();
    };
  }, []);

  const state: ImageWorkflowState = useMemo(
    () => ({
      phase,
      preflightAudit,
      postflightAudit,
      detectionHint,
      processedBlob: pipeline.processedBlob,
      processedImageUrl: pipeline.processedImageUrl,
      processedFileName: pipeline.processedFileName,
      capabilities,
    }),
    [
      capabilities,
      detectionHint,
      phase,
      pipeline.processedBlob,
      pipeline.processedFileName,
      pipeline.processedImageUrl,
      postflightAudit,
      preflightAudit,
    ],
  );

  return {
    ...pipeline,
    state,
    originalImage,
    originalImageUrl,
    metadataCleanUrl,
    workflowWarnings,
    isMetadataCleaning,
    selectImage,
    reset: clearWorkflowState,
    cancel,
    retry,
    reprocess,
    downloadMetadataClean,
  };
}

async function loadImageDataFromFile(file: File, signal?: AbortSignal) {
  assertNotAborted(signal);

  const img = new Image();
  await withObjectUrl(file, async (objectUrl) => {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.src = objectUrl;
    });
  });
  assertNotAborted(signal);

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Could not read image pixels");
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  assertNotAborted(signal);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function createAbortError() {
  const error = new Error("Workflow cancelled");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function createWorkflowId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `workflow-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function elapsedWorkflowMs(startedAt: number | null) {
  return startedAt === null ? 0 : Math.round(performance.now() - startedAt);
}
