import {
  CheckCircleIcon,
  FileSearchIcon,
  ShieldCheckIcon,
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
  const translate = (key: string, options?: Record<string, number>) =>
    String(t(key as never, options as never));
  const diff = createVerificationDiff(
    preflightAudit,
    postflightAudit,
    warnings,
  );

  if (!diff) {
    return null;
  }

  return (
    <Card className="bg-card/95">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{t("verification.title")}</CardTitle>
            <CardDescription>
              {t("verification.description")}
            </CardDescription>
          </div>
          <Badge variant={postflightAudit ? "default" : "outline"}>
            {postflightAudit ? t("verification.verified") : t("verification.partial")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <DiffTile
          icon="metadata"
          label={t("verification.metadata")}
          before={formatCount(diff.metadataBeforeCount, translate)}
          after={formatCount(diff.metadataAfterCount, translate)}
          partial={diff.metadataAfterCount === null}
        />
        <DiffTile
          icon="visible"
          label={t("verification.visible")}
          before={formatStatus(diff.visibleBefore, translate)}
          after={
            diff.visibleAfter ? formatStatus(diff.visibleAfter, translate) : t("verification.partial")
          }
          partial={diff.visibleAfter === null}
        />
        <DiffTile
          icon="hidden"
          label={t("verification.hidden")}
          before={t("verification.possible")}
          after={
            diff.hiddenAfter === "neutralized-unverified"
              ? t("verification.neutralized")
              : formatStatus(diff.hiddenAfter, translate)
          }
          partial={false}
        />

        {diff.warnings.length > 0 && (
          <div className="bg-muted/40 text-muted-foreground border p-3 text-sm sm:col-span-3 sm:text-base">
            {diff.warnings.map((warning) => translateMessage(t, warning)).join(" ")}
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
        ? ShieldCheckIcon
        : CheckCircleIcon;

  return (
    <div className="bg-muted/35 flex min-w-0 flex-col gap-3 border p-3">
      <div className="flex items-center justify-between gap-3">
        <Icon
          className={partial ? "text-muted-foreground" : "text-primary"}
          weight="bold"
        />
        {partial && <WarningCircleIcon className="text-muted-foreground" />}
      </div>
      <div>
        <p className="text-ui-overline text-muted-foreground">{label}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:text-base">
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

function formatCount(count: number | null, t: (key: string, options?: Record<string, number>) => string) {
  if (count === null) {
    return t("verification.partial");
  }

  return t("verification.signal", { count });
}

function formatStatus(value: string, t: (key: string) => string) {
  return t(`verification.status.${value}`);
}
