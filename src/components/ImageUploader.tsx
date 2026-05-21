import React, { useCallback, useState } from "react";
import {
  FileImageIcon,
  ImageSquareIcon,
  LockKeyIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { usePostHog } from "posthog-js/react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ImageUploaderProps {
  onImageSelect: (file: File) => void;
  className?: string;
  disabled?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImageSelect,
  className,
  disabled = false,
}) => {
  const posthog = usePostHog();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) return;
      setIsDragging(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) return;
      setIsDragging(false);
    },
    [disabled],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0 && files[0].type.startsWith("image/")) {
        onImageSelect(files[0]);
      }
    },
    [onImageSelect, disabled],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const files = e.target.files;
      if (files && files.length > 0) {
        posthog?.capture("action_clicked", {
          action: "upload_image",
          component: "uploader",
        });
        onImageSelect(files[0]);
      }
    },
    [onImageSelect, disabled, posthog],
  );

  return (
    <Card
      className={cn(
        "group bg-card text-card-foreground hover:bg-muted/30 relative flex h-full min-h-64 w-full cursor-pointer overflow-hidden border-0 p-6 ring-0 transition-colors",
        isDragging && "bg-primary/10",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => {
        if (!disabled) {
          posthog?.capture("action_clicked", {
            action: "upload_image",
            component: "uploader",
          });
          document.getElementById("file-upload")?.click();
        }
      }}
    >
      <div
        className={cn(
          "border-primary/50 flex min-h-full w-full flex-1 flex-col items-center justify-center border border-dashed px-6 py-12 text-center sm:px-10",
          isDragging && "border-primary",
        )}
      >
        <input
          id="file-upload"
          type="file"
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
          disabled={disabled}
        />
        <div className="flex flex-col items-center lg:translate-y-12">
          <div className="mb-9 flex flex-col items-center">
            <div className="bg-muted text-foreground group-hover:bg-accent relative flex size-28 items-center justify-center border transition-colors">
              {isDragging ? (
                <FileImageIcon className="size-14" weight="bold" />
              ) : (
                <UploadSimpleIcon className="size-14" weight="bold" />
              )}
            </div>
          </div>

          <div className="flex max-w-lg flex-col gap-4">
            <p className="text-foreground text-3xl font-black tracking-[-0.055em]">
              {isDragging ? "Drop your image" : "Drag an image"}
            </p>
            <p className="text-muted-foreground mx-auto max-w-md text-lg leading-relaxed font-medium tracking-tight">
              Drop it here, or click to select a file from your device.
            </p>

            <Button type="button" className="mt-3 h-10 gap-2 px-5 font-black">
              <ImageSquareIcon data-icon="inline-start" />
              Choose Image
            </Button>

            <div className="text-muted-foreground text-sm leading-6 font-medium">
              Supports JPG, JPEG, PNG, WebP
              <br />
              Max resolution:{" "}
              <span className="text-primary font-bold">40 MPixels</span>
            </div>
          </div>

          <div className="bg-background/70 text-muted-foreground mt-20 inline-flex max-w-full items-center gap-2 px-4 py-2 text-xs font-semibold">
            <LockKeyIcon className="size-4 shrink-0" weight="bold" />
            <span className="truncate">
              Your image is never uploaded. Everything runs locally in your
              browser.
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
