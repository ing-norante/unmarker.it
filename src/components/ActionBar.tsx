import { Button } from "./ui/button";
import { RefreshCcw, Zap } from "lucide-react";

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
  return (
    <div className="flex justify-between items-center p-4 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <div className="font-bold truncate max-w-[200px]">{fileName}</div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={onReset}
          disabled={isProcessing}
          className="border-2 border-black rounded-none hover:bg-red-100"
        >
          <RefreshCcw className="w-4 h-4 mr-2" /> Reset
        </Button>
        <Button
          onClick={onProcess}
          disabled={isProcessing || hasProcessedImage}
          variant="neobrutalist"
          className={hasProcessedImage ? "opacity-50" : ""}
        >
          <Zap className="w-4 h-4 mr-2" />
          {isProcessing ? "Processing..." : "UnmarkIt!"}
        </Button>
      </div>
    </div>
  );
}
