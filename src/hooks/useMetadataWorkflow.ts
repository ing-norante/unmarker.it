import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useObjectUrl } from "@/hooks/useObjectUrl";
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

type SetStatusMessage = (message: StatusMessage | null) => void;

interface UseMetadataWorkflowOptions {
  originalImage: File | null;
  setStatusMessage: SetStatusMessage;
}

export function useMetadataWorkflow({
  originalImage,
  setStatusMessage,
}: UseMetadataWorkflowOptions) {
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
        toast.success("Metadata scan complete.");
      } catch (error) {
        if (metadataScanJobRef.current !== scanJob) {
          return;
        }

        console.error("Metadata scan failed", error);
        setStatusMessage({
          variant: "destructive",
          title: "Could not scan metadata",
          description:
            "This file could not be read safely. Try another image and retry.",
        });
        toast.error("Could not scan metadata.");
      } finally {
        if (metadataScanJobRef.current === scanJob) {
          setIsMetadataScanning(false);
        }
      }
    },
    [clearMetadataCleanObjectUrl, setStatusMessage],
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
          title: "No cleanup needed",
          description:
            "No removable AI metadata was found for this file and format.",
        });
        toast("No cleanup needed.");
        return;
      }

      const objectUrl = setMetadataCleanObjectUrl(result.blob);
      setMetadataCleanResult(result);

      if (objectUrl) {
        triggerDownload(objectUrl, result.fileName);
      }
      toast.success("Clean copy downloaded.");
    } catch (error) {
      console.error("Metadata clean failed", error);
      setStatusMessage({
        variant: "destructive",
        title: "Could not clean metadata",
        description:
          "The metadata cleaner could not produce a safe clean copy for this file.",
      });
      toast.error("Could not clean metadata.");
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

function triggerDownload(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
