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
  const showResultPanel =
    phase === "processing" ||
    phase === "postflight-scanning" ||
    phase === "complete";

  return (
    <div className="flex flex-col gap-4 pb-2">
      <AnalysisPanel audit={preflightAudit} phase={phase} />

      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <Card className="bg-card/95 overflow-hidden">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle>{t("comparison.original")}</CardTitle>
            <CardDescription>
              {t("comparison.originalDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="bg-muted/35 relative flex h-56 items-center justify-center p-3 sm:h-64 lg:h-[min(48vh,24rem)]">
            <img
              src={originalImageUrl}
              alt={t("comparison.originalAlt")}
              className="max-h-full max-w-full object-contain"
            />
          </CardContent>
        </Card>

        {showResultPanel && (
          <Card className="bg-card/95 overflow-hidden">
            <CardHeader className="border-b px-4 py-3">
              <CardTitle>
                {processedImageUrl ? t("comparison.processed") : t("comparison.processing")}
              </CardTitle>
              <CardDescription>
                {processedImageUrl
                  ? t("comparison.processedDescription")
                  : t("comparison.processingDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="bg-muted/35 relative flex h-56 items-center justify-center p-3 sm:h-64 lg:h-[min(48vh,24rem)]">
              {processedImageUrl ? (
                <img
                  src={processedImageUrl}
                  alt={t("comparison.processedAlt")}
                  className="max-h-full max-w-full object-contain"
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
