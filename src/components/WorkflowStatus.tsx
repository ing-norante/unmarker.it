import type { FileModePolicy } from "@/lib/fileValidation";
import type { WorkflowPhase } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { translateMessage, messageId } from "@/i18n/messages";

export function FilePolicyDetails({ policy }: { policy: FileModePolicy }) {
  const { t } = useTranslation();
  return (
    <div className="text-muted-foreground text-ui-body leading-6 sm:leading-7">
      <span>{translateMessage(t, policy.supportedCopy)}</span>
      {policy.limitCopy.map((limit) => (
        <span key={messageId(limit)} className="block">
          {translateMessage(t, limit)}
        </span>
      ))}
    </div>
  );
}

export function WorkflowSummary({ phase }: { phase: WorkflowPhase }) {
  const { t } = useTranslation("workflow");
  return (
    <div className="bg-card text-card-foreground flex flex-col gap-3 border p-3 text-sm sm:p-4 sm:text-base">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold">{t(`phase.${phase}.title`)}</span>
        <span className="text-muted-foreground text-ui-caption">
          {t(`phase.${phase}.label`)}
        </span>
      </div>
      <p className="text-muted-foreground text-ui-body">
        {t(`phase.${phase}.description`)}
      </p>
    </div>
  );
}
