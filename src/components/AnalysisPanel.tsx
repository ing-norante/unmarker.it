import {
  CircleNotchIcon,
  EyeIcon,
  ShieldCheckIcon,
  ShieldWarningIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { MetadataSignalsList } from "@/components/MetadataSignalsList";
import type { ImageAuditResult, WorkflowPhase } from "@/lib/types";
import { useTranslation } from "react-i18next";
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card className="bg-card/95">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{t("workflow:analysis.provenance")}</CardTitle>
              <CardDescription>{t(`workflow:audit.score.${audit.aiScore.kind}.description`)}</CardDescription>
            </div>
            <Badge variant={scoreBadgeVariant(audit.aiScore.confidence)}>
              {t(`common:confidence.${audit.aiScore.confidence}`)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl leading-none font-black">
                {audit.aiScore.percentage}%
              </p>
              <p className="text-muted-foreground text-sm font-medium sm:text-base">
                {t(`workflow:audit.score.${audit.aiScore.kind}.label`)}
              </p>
            </div>
            <Badge variant="outline">
              {audit.aiScore.provider ??
                (audit.aiScore.kind === "none"
                  ? t("common:generic.noProvider")
                  : t("workflow:audit.score.unknownProvider"))}
            </Badge>
          </div>
          <Progress value={audit.aiScore.percentage} />
          <div className="flex flex-col gap-2">
            {audit.aiScore.evidence.slice(0, 4).map((item) => (
              <p
                key={messageId(item)}
                className="bg-muted/40 text-muted-foreground border p-2 text-sm sm:text-base"
              >
                {translateMessage(t, item)}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/95">
        <CardHeader>
          <CardTitle>{t("workflow:analysis.watermarkScan")}</CardTitle>
          <CardDescription>
            {t("workflow:analysis.watermarkDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <SignalStatus
            icon="visible"
            title={t("workflow:analysis.visible")}
            label={t(`workflow:audit.visible.${visibleKey(audit.visibleWatermark.status)}.label`)}
            description={t(`workflow:audit.visible.${visibleKey(audit.visibleWatermark.status)}.description`)}
            tone={visibleTone(audit)}
            badge={formatConfidence(audit.visibleWatermark.confidence, t("common:generic.notScanned"))}
          />
          <SignalStatus
            icon="hidden"
            title={t("workflow:analysis.hidden")}
            label={t(`workflow:audit.hidden.${audit.hiddenWatermark.status === "neutralized-unverified" ? "neutralized" : "risk"}.label`)}
            description={t(`workflow:audit.hidden.${audit.hiddenWatermark.status === "neutralized-unverified" ? "neutralized" : "risk"}.description`)}
            tone={
              audit.hiddenWatermark.status === "neutralized-unverified"
                ? "ok"
                : "warning"
            }
            badge={
              audit.hiddenWatermark.status === "neutralized-unverified"
                ? t("common:generic.processed")
                : t("common:generic.pending")
            }
          />
        </CardContent>
      </Card>

      <Card className="bg-card/95 lg:col-span-2">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{t("workflow:analysis.metadata")}</CardTitle>
              <CardDescription>
                {audit.metadataScan
                  ? t("workflow:analysis.metadataCount", { count: audit.metadataScan.signals.length, format: audit.metadataScan.format.toUpperCase() })
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
        <Card className="bg-card/95 lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("workflow:analysis.warnings")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {audit.warnings.map((warning) => (
                <li
                  key={messageId(warning)}
                  className="bg-muted/50 text-muted-foreground border p-2 text-sm sm:text-base"
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
    <Card className="bg-card/95">
      <CardHeader>
        <div className="flex items-center gap-3">
          <CircleNotchIcon className="text-muted-foreground animate-spin" />
          <div className="min-w-0">
            <CardTitle>
              {phase === "preflight-scanning"
                ? t("analysis.analyzing")
                : t("analysis.waiting")}
            </CardTitle>
            <CardDescription>
              {t("analysis.reading")}
            </CardDescription>
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
  tone: "ok" | "warning" | "danger" | "neutral";
  badge: string;
  icon: "visible" | "hidden";
}) {
  const Icon =
    icon === "visible"
      ? EyeIcon
      : tone === "ok"
        ? ShieldCheckIcon
        : ShieldWarningIcon;

  return (
    <div className="bg-muted/35 flex min-w-0 flex-col gap-3 border p-3">
      <div className="flex items-center justify-between gap-3">
        <Icon className={statusIconClass(tone)} weight="bold" />
        <Badge variant={statusBadgeVariant(tone)}>{badge}</Badge>
      </div>
      <div className="min-w-0">
        <p className="text-ui-overline text-muted-foreground">{title}</p>
        <p className="text-foreground text-sm font-black sm:text-base">
          {label}
        </p>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          {description}
        </p>
      </div>
    </div>
  );
}

function visibleTone(audit: ImageAuditResult) {
  switch (audit.visibleWatermark.status) {
    case "detected":
      return "danger";
    case "not-detected":
      return "ok";
    case "scan-failed":
      return "warning";
    default:
      return "neutral";
  }
}

function visibleKey(status: ImageAuditResult["visibleWatermark"]["status"]) {
  return status === "not-scanned" ? "notScanned" : status === "scan-failed" ? "failed" : status === "detected" ? "detected" : "clear";
}

function formatConfidence(confidence: number | null, notScanned: string) {
  if (confidence === null) {
    return notScanned;
  }

  return `${Math.round(confidence * 100)}%`;
}

function scoreBadgeVariant(
  confidence: ImageAuditResult["aiScore"]["confidence"],
) {
  if (confidence === "high") {
    return "destructive";
  }

  if (confidence === "medium") {
    return "secondary";
  }

  return "outline";
}

function statusBadgeVariant(tone: "ok" | "warning" | "danger" | "neutral") {
  if (tone === "danger") {
    return "destructive";
  }

  if (tone === "ok") {
    return "default";
  }

  return "outline";
}

function statusIconClass(tone: "ok" | "warning" | "danger" | "neutral") {
  if (tone === "danger") {
    return "text-destructive";
  }

  if (tone === "ok") {
    return "text-primary";
  }

  if (tone === "warning") {
    return "text-muted-foreground";
  }

  return "text-muted-foreground";
}
