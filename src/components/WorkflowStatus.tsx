import type { FileModePolicy } from "@/lib/fileValidation";
import { getPhaseDescription, getPhaseTitle } from "@/lib/workflowCopy";
import type { WorkflowPhase } from "@/lib/types";

export function FilePolicyDetails({ policy }: { policy: FileModePolicy }) {
  return (
    <div className="text-muted-foreground text-ui-body leading-6 sm:leading-7">
      <span>{policy.supportedCopy}</span>
      {policy.limitCopy.map((limit) => (
        <span key={limit} className="block">
          {limit}
        </span>
      ))}
    </div>
  );
}

export function WorkflowSummary({ phase }: { phase: WorkflowPhase }) {
  return (
    <div className="bg-card text-card-foreground flex flex-col gap-3 border p-3 text-sm sm:p-4 sm:text-base">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold">{getPhaseTitle(phase)}</span>
        <span className="text-muted-foreground text-ui-caption uppercase">
          {phase.replace(/-/g, " ")}
        </span>
      </div>
      <p className="text-muted-foreground text-ui-body">
        {getPhaseDescription(phase)}
      </p>
    </div>
  );
}
