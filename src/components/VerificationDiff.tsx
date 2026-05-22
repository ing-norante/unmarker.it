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

interface VerificationDiffProps {
  preflightAudit: ImageAuditResult | null;
  postflightAudit: ImageAuditResult | null;
  warnings: string[];
}

export function VerificationDiff({
  preflightAudit,
  postflightAudit,
  warnings,
}: VerificationDiffProps) {
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
            <CardTitle>Before / after verification</CardTitle>
            <CardDescription>
              The JPEG output is rechecked locally after processing.
            </CardDescription>
          </div>
          <Badge variant={postflightAudit ? "default" : "outline"}>
            {postflightAudit ? "verified" : "partial"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <DiffTile
          icon="metadata"
          label="Metadata"
          before={formatCount(diff.metadataBeforeCount)}
          after={formatCount(diff.metadataAfterCount)}
          partial={diff.metadataAfterCount === null}
        />
        <DiffTile
          icon="visible"
          label="Visible watermark"
          before={formatStatus(diff.visibleBefore)}
          after={
            diff.visibleAfter ? formatStatus(diff.visibleAfter) : "partial"
          }
          partial={diff.visibleAfter === null}
        />
        <DiffTile
          icon="hidden"
          label="Hidden watermark"
          before="possible"
          after={
            diff.hiddenAfter === "neutralized-unverified"
              ? "neutralized"
              : formatStatus(diff.hiddenAfter)
          }
          partial={false}
        />

        {diff.warnings.length > 0 && (
          <div className="bg-muted/40 text-muted-foreground border p-3 text-sm sm:col-span-3 sm:text-base">
            {diff.warnings.join(" ")}
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
              Before
            </p>
            <p className="font-black">{before}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-bold uppercase">
              After
            </p>
            <p className="font-black">{after}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatCount(count: number | null) {
  if (count === null) {
    return "partial";
  }

  return `${count} signal${count === 1 ? "" : "s"}`;
}

function formatStatus(value: string) {
  return value.replace(/-/g, " ");
}
