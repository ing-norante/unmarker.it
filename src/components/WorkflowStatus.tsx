import type { WorkflowFilePolicy } from "@/lib/fileValidation";
import type { WorkflowPhase } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { translateMessage, messageId } from "@/i18n/messages";

export function FilePolicyDetails({ policy }: { policy: WorkflowFilePolicy }) {
  const { t } = useTranslation();
  return (
    <div className="text-muted-foreground text-ui-body">
      <span>{translateMessage(t, policy.supportedCopy)}</span>
      {policy.limitCopy.map((limit) => (
        <span key={messageId(limit)} className="block">
          {translateMessage(t, limit)}
        </span>
      ))}
    </div>
  );
}

export function WorkflowSummary({
  phase,
  hasWarnings = false,
  verificationFailed = false,
}: {
  phase: WorkflowPhase;
  hasWarnings?: boolean;
  verificationFailed?: boolean;
}) {
  const { t } = useTranslation("workflow");
  const description =
    phase === "complete" && verificationFailed
      ? t("phase.complete.verificationUnavailable")
      : phase === "complete" && hasWarnings
        ? t("phase.complete.withWarnings")
        : t(`phase.${phase}.description`);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="bg-card text-card-foreground flex flex-col gap-3 border p-3 text-sm sm:p-4 sm:text-base"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-ui-title">{t(`phase.${phase}.title`)}</span>
        <span
          aria-hidden="true"
          className="text-muted-foreground text-ui-caption"
        >
          {t(`phase.${phase}.label`)}
        </span>
      </div>
      <p className="text-muted-foreground text-ui-body">{description}</p>
    </div>
  );
}
