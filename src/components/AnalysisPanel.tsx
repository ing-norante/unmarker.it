import { CircleNotchIcon, EyeIcon, QuestionIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MetadataSignalsList } from "@/components/MetadataSignalsList";
import type { ImageAuditResult, WorkflowPhase } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { presentVisible, type SignalTone } from "@/lib/workflow/presentation";
import { messageId, translateMessage } from "@/i18n/messages";

interface AnalysisPanelProps {
  audit: ImageAuditResult | null;
  phase: WorkflowPhase;
}

export function AnalysisPanel({ audit, phase }: AnalysisPanelProps) {
  const { t } = useTranslation(["workflow", "common"]);
  if (!audit) {
    return <AnalysisSkeleton phase={phase} />;
  }

  const visible = presentVisible(audit.visibleWatermark.status);
  return (
    <div className="grid min-w-0 gap-4 @min-[52rem]/comparison:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card className="bg-card/95 @container/panel min-w-0">
        <CardHeader>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 [&>div]:flex-1 [&>div]:basis-48">
            <div>
              <CardTitle>{t("workflow:analysis.provenance")}</CardTitle>
              <CardDescription>
                {t(`workflow:audit.score.${audit.aiScore.kind}.description`)}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-lg font-bold">
            {t(`workflow:audit.score.${audit.aiScore.kind}.label`)}
          </p>
          {audit.aiScore.provider && (
            <Badge variant="outline">{audit.aiScore.provider}</Badge>
          )}
          <ul className="text-muted-foreground space-y-2 text-base leading-relaxed wrap-anywhere">
            {audit.aiScore.evidence.slice(0, 4).map((item) => (
              <li key={messageId(item)}>{translateMessage(t, item)}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="bg-card/95 @container/panel min-w-0">
        <CardHeader>
          <CardTitle>{t("workflow:analysis.watermarkScan")}</CardTitle>
          <CardDescription>
            {t("workflow:analysis.watermarkDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 @min-[30rem]/panel:grid-cols-2">
          <SignalStatus
            icon="visible"
            title={t("workflow:analysis.visible")}
            label={translateMessage(t, visible.label)}
            description={translateMessage(t, visible.description)}
            tone={visible.tone}
            badge={formatConfidence(
              audit.visibleWatermark.confidence,
              t("common:generic.notScanned"),
            )}
          />
          <SignalStatus
            icon="hidden"
            title={t("workflow:analysis.hidden")}
            label={t(
              `workflow:audit.hidden.${audit.stage === "postflight" ? "neutralized" : "risk"}.label`,
            )}
            description={t(
              `workflow:audit.hidden.${audit.stage === "postflight" ? "neutralized" : "risk"}.description`,
            )}
            tone="neutral"
            badge={t("workflow:verification.status.unverified")}
          />
        </CardContent>
      </Card>

      {audit.metadataScan?.c2pa && (
        <Card className="bg-card/95 min-w-0 @min-[52rem]/comparison:col-span-2">
          <CardHeader>
            <CardTitle>{t("workflow:c2pa.title")}</CardTitle>
            <CardDescription>{t("workflow:c2pa.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Badge variant="outline">
              {t(`workflow:c2pa.presence.${audit.metadataScan.c2pa.presence}`)}
            </Badge>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-sm">
                  {t("workflow:c2pa.originLabel")}
                </dt>
                <dd>
                  {t(`workflow:c2pa.origin.${audit.metadataScan.c2pa.origin}`)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">
                  {t("workflow:c2pa.integrityLabel")}
                </dt>
                <dd>
                  {t(
                    `workflow:c2pa.integrity.${audit.metadataScan.c2pa.integrity}`,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">
                  {t("workflow:c2pa.trustLabel")}
                </dt>
                <dd>{t("workflow:c2pa.trust")}</dd>
              </div>
            </dl>
            <ul className="text-muted-foreground space-y-1 text-sm">
              {audit.metadataScan.c2pa.reasons.map((reason) => (
                <li key={reason}>{t(`workflow:c2pa.reason.${reason}`)}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/95 min-w-0 @min-[52rem]/comparison:col-span-2">
        <CardHeader>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 [&>div]:flex-1 [&>div]:basis-48">
            <div>
              <CardTitle>{t("workflow:analysis.metadata")}</CardTitle>
              <CardDescription>
                {audit.metadataScan
                  ? t("workflow:analysis.metadataCount", {
                      count: audit.metadataScan.signals.length,
                      format: audit.metadataScan.format.toUpperCase(),
                    })
                  : t("workflow:analysis.metadataUnavailable")}
              </CardDescription>
            </div>
            <Badge variant="outline">
              {audit.metadataScan?.format ?? t("common:generic.partial")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <MetadataSignalsList scanResult={audit.metadataScan} />
        </CardContent>
      </Card>

      {audit.warnings.length > 0 && (
        <Card className="bg-card/95 min-w-0 @min-[52rem]/comparison:col-span-2">
          <CardHeader>
            <CardTitle>{t("workflow:analysis.warnings")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {audit.warnings.map((warning) => (
                <li
                  key={messageId(warning)}
                  className="bg-muted/50 text-muted-foreground border p-2 text-base leading-relaxed"
                >
                  {translateMessage(t, warning)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AnalysisSkeleton({ phase }: { phase: WorkflowPhase }) {
  const { t } = useTranslation("workflow");
  return (
    <Card className="bg-card/95 @container/panel min-w-0">
      <CardHeader>
        <div className="flex items-center gap-3">
          <CircleNotchIcon className="text-muted-foreground animate-spin" />
          <div className="min-w-0">
            <CardTitle>
              {phase === "preflight-scanning"
                ? t("analysis.analyzing")
                : t("analysis.waiting")}
            </CardTitle>
            <CardDescription>{t("analysis.reading")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </CardContent>
    </Card>
  );
}

function SignalStatus({
  title,
  label,
  description,
  tone,
  badge,
  icon,
}: {
  title: string;
  label: string;
  description: string;
  tone: SignalTone;
  badge: string;
  icon: "visible" | "hidden";
}) {
  const Icon = icon === "visible" ? EyeIcon : QuestionIcon;

  return (
    <div className="bg-muted/35 flex min-w-0 flex-col gap-3 border p-3">
      <div className="flex items-center justify-between gap-3">
        <Icon className={statusIconClass(tone)} weight="bold" />
        <Badge variant={statusBadgeVariant(tone)}>{badge}</Badge>
      </div>
      <div className="min-w-0">
        <p className="text-ui-overline text-muted-foreground">{title}</p>
        <p className="text-foreground text-base leading-snug font-bold text-balance">
          {label}
        </p>
        <p className="text-muted-foreground text-ui-body mt-1">{description}</p>
      </div>
    </div>
  );
}

function formatConfidence(confidence: number | null, notScanned: string) {
  if (confidence === null) {
    return notScanned;
  }

  return `${Math.round(confidence * 100)}%`;
}

function statusBadgeVariant(tone: SignalTone) {
  if (tone === "danger") {
    return "destructive";
  }

  if (tone === "ok") {
    return "default";
  }

  return "outline";
}

function statusIconClass(tone: SignalTone) {
  if (tone === "danger") {
    return "text-destructive-text";
  }

  if (tone === "ok") {
    return "text-primary-text";
  }

  if (tone === "warning") {
    return "text-muted-foreground";
  }

  return "text-muted-foreground";
}
