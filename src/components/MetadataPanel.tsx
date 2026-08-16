import { useMemo, useState } from "react";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  DownloadSimpleIcon,
  FileImageIcon,
  ShieldWarningIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type {
  MetadataCleanResult,
  MetadataScanResult,
} from "@/lib/types";
import { useTranslation } from "react-i18next";
import { messageId, translateMessage } from "@/i18n/messages";
import { metadataWarningId, translateMetadataWarning } from "@/i18n/metadata";

interface MetadataPanelProps {
  file: File;
  fileUrl: string | null;
  scanResult: MetadataScanResult | null;
  cleanResult: MetadataCleanResult | null;
  isScanning: boolean;
  isCleaning: boolean;
  canDownloadClean: boolean;
  onReset: () => void;
  onDownloadClean: () => void;
}

export function MetadataPanel({
  file,
  fileUrl,
  scanResult,
  cleanResult,
  isScanning,
  isCleaning,
  canDownloadClean,
  onReset,
  onDownloadClean,
}: MetadataPanelProps) {
  const { t } = useTranslation(["metadata", "common"]);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const previewFailed = fileUrl !== null && failedPreviewUrl === fileUrl;
  const translate = (key: string) => String(t(key as never));
  const status = getMetadataStatus(scanResult, isScanning, translate);

  const categories = useMemo(() => {
    if (!scanResult) {
      return [];
    }

    return [
      ...new Set(
        scanResult.signals.map((signal) => t(`metadata:categories.${signal.type}`)),
      ),
    ];
  }, [scanResult, t]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-4 duration-500 lg:min-h-0 lg:flex-1">
      <div className="bg-card/95 text-card-foreground flex flex-col justify-between gap-4 border p-4 lg:sticky lg:top-0 lg:z-10 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium sm:text-base">
          <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center border">
            <FileImageIcon weight="bold" />
          </span>
          <span className="truncate">{file.name}</span>
          <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
            {formatBytes(file.size)}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={onReset}
            disabled={isScanning || isCleaning}
          >
            <ArrowClockwiseIcon data-icon="inline-start" weight="bold" />
            {t("common:actions.reset")}
          </Button>
          <Button
            onClick={onDownloadClean}
            disabled={!canDownloadClean || isScanning || isCleaning}
          >
            {isCleaning ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <DownloadSimpleIcon data-icon="inline-start" weight="bold" />
            )}
            {isCleaning ? t("metadata:panel.cleaning") : t("metadata:panel.downloadClean")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:min-h-0 lg:flex-1">
        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>{t("metadata:panel.original")}</CardTitle>
            <CardDescription>
              {file.type || t("metadata:panel.unknownType")} / {formatBytes(file.size)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 flex h-64 items-center justify-center border p-3 lg:h-[min(48vh,24rem)]">
              {fileUrl && !previewFailed ? (
                <img
                  src={fileUrl}
                  alt={t("metadata:panel.original")}
                  className="max-h-full max-w-full object-contain shadow-sm"
                  onError={() => setFailedPreviewUrl(fileUrl)}
                />
              ) : (
                <FileFallback file={file} />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>{status.label}</CardTitle>
                <CardDescription>
                  {getStatusDetail(scanResult, isScanning, canDownloadClean, translate)}
                </CardDescription>
              </div>
              <StatusIcon tone={status.tone} />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{scanResult?.format ?? t("common:generic.pending")}</Badge>
              <Badge variant={status.badgeVariant}>{status.shortLabel}</Badge>
            </div>

            <section className="flex flex-col gap-2">
              <h3 className="text-ui-overline">
                {t("metadata:panel.categories")}
              </h3>
              {categories.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <Badge key={category} variant="secondary">
                      {category}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground border border-dashed p-3 text-sm sm:text-base">
                  {isScanning ? t("metadata:panel.scanningShort") : t("metadata:panel.empty")}
                </p>
              )}
            </section>

            {scanResult && scanResult.signals.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-ui-overline">
                  {t("metadata:panel.signals")}
                </h3>
                <div className="flex flex-col gap-2">
                  {scanResult.signals.map((signal, index) => (
                    <div
                      key={`${signal.location}-${signal.marker ?? messageId(signal.label)}-${index}`}
                      className="bg-muted/40 flex min-w-0 flex-col gap-1 border p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold sm:text-base">
                          {translateMessage(t, signal.label)}
                        </span>
                        <Badge
                          variant={signal.removable ? "default" : "outline"}
                        >
                          {signal.removable ? t("metadata:panel.removable") : t("metadata:panel.scanOnlyBadge")}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground truncate font-mono text-xs sm:text-sm">
                        {signal.location}
                        {signal.marker ? ` / ${signal.marker}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {cleanResult && cleanResult.removedCount > 0 && (
              <div className="bg-primary/10 text-primary flex items-start gap-2 border p-3 text-sm font-bold sm:text-base">
                <CheckCircleIcon className="mt-0.5 shrink-0" weight="bold" />
                <p>
                  {t("metadata:panel.cleanReady", { count: cleanResult.removedCount })}
                </p>
              </div>
            )}

            {scanResult && scanResult.warnings.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-ui-overline">
                  {t("metadata:panel.warnings")}
                </h3>
                <ul className="flex flex-col gap-2">
                  {scanResult.warnings.map((warning) => (
                    <li
                      key={metadataWarningId(warning)}
                      className="bg-muted/50 text-muted-foreground border p-2 text-sm sm:text-base"
                    >
                      {translateMetadataWarning(t, warning)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FileFallback({ file }: { file: File }) {
  const { t } = useTranslation("metadata");
  return (
    <div className="border-muted-foreground/30 text-muted-foreground flex max-w-full flex-col items-center gap-3 border border-dashed p-6 text-center">
      <FileImageIcon className="size-8" weight="bold" />
      <div className="min-w-0">
        <p className="text-foreground max-w-[16rem] truncate font-bold">
          {file.name}
        </p>
        <p className="font-mono text-xs uppercase sm:text-sm">
          {file.type || t("panel.unknownType")} / {formatBytes(file.size)}
        </p>
      </div>
    </div>
  );
}

function StatusIcon({ tone }: { tone: MetadataStatus["tone"] }) {
  if (tone === "scanning") {
    return (
      <CircleNotchIcon className="text-muted-foreground size-7 shrink-0 animate-spin" />
    );
  }

  if (tone === "found") {
    return (
      <ShieldWarningIcon
        className="text-destructive size-7 shrink-0"
        weight="bold"
      />
    );
  }

  if (tone === "partial") {
    return (
      <WarningCircleIcon
        className="text-muted-foreground size-7 shrink-0"
        weight="bold"
      />
    );
  }

  return (
    <CheckCircleIcon className="text-primary size-7 shrink-0" weight="bold" />
  );
}

interface MetadataStatus {
  label: string;
  shortLabel: string;
  tone: "scanning" | "found" | "clean" | "partial";
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
}

function getMetadataStatus(
  scanResult: MetadataScanResult | null,
  isScanning: boolean,
  t: (key: string) => string,
): MetadataStatus {
  if (isScanning || !scanResult) {
    return {
      label: t("metadata:panel.scanning"), shortLabel: t("metadata:panel.scanningShort"),
      tone: "scanning",
      badgeVariant: "secondary",
    };
  }

  if (isPartialScan(scanResult)) {
    return {
      label: t("metadata:panel.partial"),
      shortLabel: t("metadata:panel.partialShort"),
      tone: "partial",
      badgeVariant: "outline",
    };
  }

  if (scanResult.hasAiMetadata) {
    return {
      label: t("metadata:panel.found"),
      shortLabel: t("metadata:panel.foundShort"),
      tone: "found",
      badgeVariant: "destructive",
    };
  }

  return {
    label: t("metadata:panel.clean"),
    shortLabel: t("metadata:panel.cleanShort"),
    tone: "clean",
    badgeVariant: "default",
  };
}

function getStatusDetail(
  scanResult: MetadataScanResult | null,
  isScanning: boolean,
  canDownloadClean: boolean,
  t: (key: string) => string,
) {
  if (isScanning || !scanResult) {
    return t("metadata:panel.reading");
  }

  if (canDownloadClean) {
    return t("metadata:panel.cleanAvailable");
  }

  if (scanResult.hasAiMetadata) {
    return t("metadata:panel.scanOnly");
  }

  return t("metadata:panel.noCleanup");
}

function isPartialScan(scanResult: MetadataScanResult) {
  return scanResult.format === "unknown" || scanResult.warnings.length > 0;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
