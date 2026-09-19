import { showsResultPanel } from "@/lib/workflow/presentation";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardDescription,
  CardTitle,
} from "./ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { CircleNotchIcon, ImageSquareIcon } from "@phosphor-icons/react";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { VerificationDiff } from "@/components/VerificationDiff";
import type { ImageAuditResult, WorkflowPhase } from "@/lib/types";
import type { MessageDescriptor } from "@/i18n/messages";
import { useTranslation } from "react-i18next";

interface ImageComparisonProps {
  originalImageUrl: string;
  processedImageUrl: string | null;
  phase: WorkflowPhase;
  preflightAudit: ImageAuditResult | null;
  postflightAudit: ImageAuditResult | null;
  workflowWarnings: MessageDescriptor[];
}

export function ImageComparison({
  originalImageUrl,
  processedImageUrl,
  phase,
  preflightAudit,
  postflightAudit,
  workflowWarnings,
}: ImageComparisonProps) {
  const { t } = useTranslation("workflow");
  const showResultPanel = showsResultPanel(phase);

  return (
    <div className="@container/comparison flex min-w-0 flex-col gap-4 pb-2">
      <AnalysisPanel audit={preflightAudit} phase={phase} />

      <div className="grid gap-4 @min-[40rem]/comparison:grid-cols-2 @min-[40rem]/comparison:gap-5">
        <Card className="bg-card/95 overflow-hidden">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle>{t("comparison.original")}</CardTitle>
            <CardDescription>
              {t("comparison.originalDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="bg-muted/35 relative flex min-h-56 items-center justify-center p-3 @min-[40rem]/comparison:min-h-64">
            <ImagePreview
              key={originalImageUrl}
              src={originalImageUrl}
              alt={t("comparison.originalAlt")}
              errorDescription={t("comparison.originalPreviewUnavailable")}
            />
          </CardContent>
        </Card>

        {showResultPanel && (
          <Card className="bg-card/95 overflow-hidden">
            <CardHeader className="border-b px-4 py-3">
              <CardTitle>
                {processedImageUrl
                  ? t("comparison.processed")
                  : t("comparison.processing")}
              </CardTitle>
              <CardDescription>
                {processedImageUrl
                  ? t("comparison.processedDescription")
                  : t("comparison.processingDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="bg-muted/35 relative flex min-h-56 items-center justify-center p-3 @min-[40rem]/comparison:min-h-64">
              {processedImageUrl ? (
                <ImagePreview
                  key={processedImageUrl}
                  src={processedImageUrl}
                  alt={t("comparison.processedAlt")}
                  errorDescription={t("comparison.processedPreviewUnavailable")}
                  processed
                />
              ) : (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      {phase === "processing" ||
                      phase === "postflight-scanning" ? (
                        <CircleNotchIcon className="animate-spin" />
                      ) : (
                        <ImageSquareIcon />
                      )}
                    </EmptyMedia>
                    <EmptyTitle>
                      {phase === "postflight-scanning"
                        ? t("comparison.verifyingOutput")
                        : t("comparison.processingImage")}
                    </EmptyTitle>
                    <EmptyDescription>
                      {t("comparison.resultPending")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {(phase === "complete" || workflowWarnings.length > 0) && (
        <VerificationDiff
          preflightAudit={preflightAudit}
          postflightAudit={postflightAudit}
          warnings={workflowWarnings}
        />
      )}
    </div>
  );
}

function ImagePreview({
  src,
  alt,
  errorDescription,
  processed = false,
}: {
  src: string;
  alt: string;
  errorDescription: string;
  processed?: boolean;
}) {
  const { t } = useTranslation("workflow");
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  if (status === "error") {
    return (
      <Empty role="status">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImageSquareIcon />
          </EmptyMedia>
          <EmptyTitle>{t("comparison.previewUnavailable")}</EmptyTitle>
          <EmptyDescription>{errorDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div
      className={`${processed ? "result-preview-frame" : ""}relative flex max-w-full`}
      data-ready={status === "ready"}
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[min(60svh,24rem)] max-w-full object-contain"
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("error")}
      />
    </div>
  );
}
