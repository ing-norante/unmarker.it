import {
  EyeIcon,
  FileSearchIcon,
  QuestionIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  presentVerification,
  presentVisible,
  signalCount,
} from "@/lib/workflow/presentation";
import { createVerificationDiff } from "@/lib/imageAudit";
import type { ImageAuditResult } from "@/lib/types";
import type { MessageDescriptor } from "@/i18n/messages";
import { translateMessage } from "@/i18n/messages";
import { useTranslation } from "react-i18next";

interface VerificationDiffProps {
  preflightAudit: ImageAuditResult | null;
  postflightAudit: ImageAuditResult | null;
  warnings: MessageDescriptor[];
}

export function VerificationDiff({
  preflightAudit,
  postflightAudit,
  warnings,
}: VerificationDiffProps) {
  const { t } = useTranslation("workflow");
  const diff = createVerificationDiff(
    preflightAudit,
    postflightAudit,
    warnings,
  );

  if (!diff) {
    return null;
  }

  const { visibleChecked, metadataChecked, checksComplete } =
    presentVerification(postflightAudit);

  return (
    <Card className="bg-card/95 @container/verification min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3 [&>div]:min-w-0 [&>div]:flex-1 [&>div]:basis-48">
          <div>
            <CardTitle>{t("verification.title")}</CardTitle>
            <CardDescription>{t("verification.description")}</CardDescription>
          </div>
          <Badge variant={checksComplete ? "default" : "outline"}>
            {checksComplete
              ? t("verification.verified")
              : t("verification.partial")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 @min-[48rem]/verification:grid-cols-3">
        <DiffTile
          icon="metadata"
          label={t("verification.metadata")}
          before={translateMessage(t, signalCount(diff.metadataBeforeCount))}
          after={translateMessage(t, signalCount(diff.metadataAfterCount))}
          partial={!metadataChecked}
        />
        <DiffTile
          icon="visible"
          label={t("verification.visible")}
          before={translateMessage(
            t,
            presentVisible(diff.visibleBefore).verification,
          )}
          after={
            diff.visibleAfter
              ? translateMessage(
                  t,
                  presentVisible(diff.visibleAfter).verification,
                )
              : t("verification.partial")
          }
          partial={!visibleChecked}
        />
        <DiffTile
          icon="hidden"
          label={t("verification.hidden")}
          before={t("verification.possible")}
          after={t("verification.status.unverified")}
          partial={false}
        />

        {diff.warnings.length > 0 && (
          <div className="bg-muted/40 text-muted-foreground border p-3 text-base leading-relaxed @min-[48rem]/verification:col-span-3">
            {diff.warnings
              .map((warning) => translateMessage(t, warning))
              .join(" ")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DiffTile({
  label,
  before,
  after,
  partial,
  icon,
}: {
  label: string;
  before: string;
  after: string;
  partial: boolean;
  icon: "metadata" | "visible" | "hidden";
}) {
  const { t } = useTranslation("workflow");
  const Icon =
    icon === "metadata"
      ? FileSearchIcon
      : icon === "hidden"
        ? QuestionIcon
        : EyeIcon;

  return (
    <div className="bg-muted/35 flex min-w-0 flex-col gap-3 border p-3">
      <div className="flex items-center justify-between gap-3">
        <Icon
          className={
            partial || icon === "hidden"
              ? "text-muted-foreground"
              : "text-primary-text"
          }
          weight="bold"
        />
        {partial && <WarningCircleIcon className="text-muted-foreground" />}
      </div>
      <div>
        <p className="text-ui-overline text-muted-foreground">{label}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-base leading-normal wrap-anywhere tabular-nums">
          <div>
            <p className="text-muted-foreground text-xs font-bold uppercase">
              {t("verification.before")}
            </p>
            <p className="font-black">{before}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-bold uppercase">
              {t("verification.after")}
            </p>
            <p className="font-black">{after}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
