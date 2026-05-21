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
  accept?: string;
  title?: string;
  description?: string;
  details?: React.ReactNode;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImageSelect,
  className,
  disabled = false,
  accept = "image/*",
  title,
  description,
  details,
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
      if (files.length > 0) {
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
        "group bg-card text-card-foreground hover:bg-muted/30 relative flex h-full min-h-64 w-full min-w-0 cursor-pointer overflow-hidden border-0 p-4 ring-0 transition-colors sm:p-6",
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
          "border-primary/50 flex min-h-full w-full min-w-0 flex-1 flex-col items-center justify-center border border-dashed px-4 py-8 text-center sm:px-6 sm:py-12 lg:px-10",
          isDragging && "border-primary",
        )}
      >
        <input
          id="file-upload"
          type="file"
          className="hidden"
          accept={accept}
          onChange={handleFileChange}
          disabled={disabled}
        />
        <div className="flex w-full min-w-0 flex-col items-center lg:translate-y-12">
          <div className="mb-6 flex flex-col items-center sm:mb-9">
            <div className="bg-muted text-foreground group-hover:bg-accent relative flex size-20 items-center justify-center border transition-colors sm:size-28">
              {isDragging ? (
                <FileImageIcon className="size-10 sm:size-14" weight="bold" />
              ) : (
                <UploadSimpleIcon
                  className="size-10 sm:size-14"
                  weight="bold"
                />
              )}
            </div>
          </div>

          <div className="flex w-full max-w-lg min-w-0 flex-col gap-3 sm:gap-4">
            <p className="text-foreground text-xl font-black tracking-tight sm:text-2xl sm:tracking-[-0.055em] lg:text-3xl">
              {isDragging ? "Drop your image" : (title ?? "Drag an image")}
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed font-medium tracking-tight text-pretty sm:text-base lg:text-lg">
              {description ??
                "Drop it here, or click to select a file from your device."}
            </p>

            <Button
              type="button"
              className="mt-1 h-10 w-full gap-2 px-5 font-black sm:mt-3 sm:w-auto"
            >
              <ImageSquareIcon data-icon="inline-start" />
              Choose Image
            </Button>

            {details ?? (
              <div className="text-muted-foreground text-xs leading-6 font-medium sm:text-sm">
                Supports JPG, JPEG, PNG, WebP
                <br />
                Max resolution:{" "}
                <span className="text-primary font-bold">40 MPixels</span>
              </div>
            )}
          </div>

          <div className="bg-background/70 text-muted-foreground mt-8 flex w-full max-w-lg min-w-0 items-start justify-center gap-2 px-3 py-2 text-center text-[11px] font-semibold sm:mt-12 sm:px-4 sm:text-xs lg:mt-20">
            <LockKeyIcon
              className="mt-0.5 size-3.5 shrink-0 sm:size-4"
              weight="bold"
            />
            <span className="text-pretty">
              Your image is never uploaded. Everything runs locally in your
              browser.
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
