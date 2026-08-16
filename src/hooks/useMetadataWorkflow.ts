import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { triggerBrowserDownload } from "@/lib/download";
import {
  canCleanMetadata,
  cleanImageMetadata,
  scanImageMetadata,
} from "@/lib/metadataCleaner";
import type {
  MetadataCleanResult,
  MetadataScanResult,
  StatusMessage,
} from "@/lib/types";
import { message } from "@/i18n/messages";
import { useTranslation } from "react-i18next";

type SetStatusMessage = (message: StatusMessage | null) => void;

interface UseMetadataWorkflowOptions {
  originalImage: File | null;
  setStatusMessage: SetStatusMessage;
}

export function useMetadataWorkflow({
  originalImage,
  setStatusMessage,
}: UseMetadataWorkflowOptions) {
  const { t } = useTranslation("workflow");
  const [metadataScanResult, setMetadataScanResult] =
    useState<MetadataScanResult | null>(null);
  const [metadataCleanResult, setMetadataCleanResult] =
    useState<MetadataCleanResult | null>(null);
  const [isMetadataScanning, setIsMetadataScanning] = useState(false);
  const [isMetadataCleaning, setIsMetadataCleaning] = useState(false);

  const metadataScanJobRef = useRef(0);
  const {
    url: metadataCleanUrl,
    setObjectUrl: setMetadataCleanObjectUrl,
    clearObjectUrl: clearMetadataCleanObjectUrl,
  } = useObjectUrl();

  const resetMetadataWorkflow = useCallback(() => {
    metadataScanJobRef.current += 1;
    setMetadataScanResult(null);
    setMetadataCleanResult(null);
    clearMetadataCleanObjectUrl();
    setIsMetadataScanning(false);
    setIsMetadataCleaning(false);
  }, [clearMetadataCleanObjectUrl]);

  const scanMetadata = useCallback(
    async (file: File) => {
      setMetadataScanResult(null);
      setMetadataCleanResult(null);
      clearMetadataCleanObjectUrl();

      const scanJob = metadataScanJobRef.current + 1;
      metadataScanJobRef.current = scanJob;
      setIsMetadataScanning(true);

      try {
        const result = await scanImageMetadata(file);
        if (metadataScanJobRef.current !== scanJob) {
          return;
        }

        setMetadataScanResult(result);
        toast.success(t("toasts.metadataScanned"));
      } catch (error) {
        if (metadataScanJobRef.current !== scanJob) {
          return;
        }

        console.error("Metadata scan failed", error);
        setStatusMessage({
          variant: "destructive",
          title: message("workflow:messages.scanFailed.title"),
          description: message("workflow:messages.scanFailed.description"),
        });
        toast.error(t("toasts.metadataScanFailed"));
      } finally {
        if (metadataScanJobRef.current === scanJob) {
          setIsMetadataScanning(false);
        }
      }
    },
    [clearMetadataCleanObjectUrl, setStatusMessage, t],
  );

  const downloadCleanCopy = useCallback(async () => {
    if (!originalImage || !metadataScanResult || isMetadataCleaning) {
      return;
    }

    setStatusMessage(null);
    setIsMetadataCleaning(true);
    setMetadataCleanResult(null);
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
      setMetadataCleanResult(result);

      if (objectUrl) {
        triggerBrowserDownload(objectUrl, result.fileName);
      }
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
    clearMetadataCleanObjectUrl,
    isMetadataCleaning,
    metadataScanResult,
    originalImage,
    setMetadataCleanObjectUrl,
    setStatusMessage,
    t,
  ]);

  return {
    metadataScanResult,
    metadataCleanResult,
    metadataCleanUrl,
    isMetadataScanning,
    isMetadataCleaning,
    metadataCanDownloadClean: canCleanMetadata(metadataScanResult),
    scanMetadata,
    downloadCleanCopy,
    resetMetadataWorkflow,
  };
}
