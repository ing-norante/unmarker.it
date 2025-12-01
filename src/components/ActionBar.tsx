import { Button } from "./ui/button";
import { RefreshCcw, Zap } from "lucide-react";
import { usePostHog } from "posthog-js/react";

interface ActionBarProps {
  fileName: string;
  isProcessing: boolean;
  hasProcessedImage: boolean;
  onReset: () => void;
  onProcess: () => void;
}

export function ActionBar({
  fileName,
  isProcessing,
  hasProcessedImage,
  onReset,
  onProcess,
}: ActionBarProps) {
  const posthog = usePostHog();

  const handleReset = () => {
    posthog?.capture("action_clicked", {
      action: "reset",
      component: "action_bar",
    });
    onReset();
  };

  const handleProcess = () => {
    posthog?.capture("action_clicked", {
      action: "process_image",
      component: "action_bar",
    });
    onProcess();
  };

  return (
    <div className="border-foreground bg-background flex flex-col items-center justify-between space-y-4 border-2 p-4 shadow-[4px_4px_0px_0px_rgba(var(--neo-shadow),1)] lg:flex-row">
      <div className="max-w-[200px] truncate font-bold">{fileName}</div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={isProcessing}
          className="border-foreground rounded-none border-2 hover:bg-red-100 dark:hover:bg-red-900"
        >
          <RefreshCcw className="mr-2 h-4 w-4" /> Reset
        </Button>
        <Button
          onClick={handleProcess}
          disabled={isProcessing || hasProcessedImage}
          variant="neobrutalist"
          className={hasProcessedImage ? "opacity-50" : ""}
        >
          <Zap className="mr-2 h-4 w-4" />
          {isProcessing ? "Processing..." : "UnmarkIt!"}
        </Button>
      </div>
    </div>
  );
}
