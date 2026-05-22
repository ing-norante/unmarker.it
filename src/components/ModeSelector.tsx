import { FileSearchIcon, LightningIcon } from "@phosphor-icons/react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AppMode } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ModeSelectorProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function ModeSelector({
  mode,
  onModeChange,
  disabled = false,
  className,
}: ModeSelectorProps) {
  return (
    <Tabs
      value={mode}
      onValueChange={(value) => {
        void onModeChange(value as AppMode);
      }}
      className={cn("w-full", className)}
    >
      <TabsList className="grid h-10 w-full grid-cols-2 sm:h-11">
        <TabsTrigger value="unmark" disabled={disabled} className="min-w-0 text-sm sm:text-base">
          <LightningIcon data-icon="inline-start" weight="bold" />
          <span className="truncate">Watermark remover</span>
        </TabsTrigger>
        <TabsTrigger value="metadata" disabled={disabled} className="min-w-0 text-sm sm:text-base">
          <FileSearchIcon data-icon="inline-start" weight="bold" />
          <span className="truncate">Metadata analyzer</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
