import React, { useCallback, useId, useRef, useState } from "react";
import {
  FileImageIcon,
  ImageSquareIcon,
  LockKeyIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { usePostHog } from "posthog-js/react";
import { trackAction } from "@/lib/analytics";
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
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const selectFile = useCallback(
    (file: File) => {
      trackAction(posthog, "upload_image", "uploader");
      onImageSelect(file);
    },
    [onImageSelect, posthog],
  );

  const openFileDialog = useCallback(() => {
    if (disabled) {
      return;
    }

    fileInputRef.current?.click();
  }, [disabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) {
        return;
      }

      if (e.key !== "Enter" && e.key !== " ") {
        return;
      }

      e.preventDefault();
      openFileDialog();
    },
    [openFileDialog],
  );

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
        selectFile(files[0]);
      }
    },
    [selectFile, disabled],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const files = e.target.files;
      if (files && files.length > 0) {
        selectFile(files[0]);
      }
    },
    [selectFile, disabled],
  );

  return (
    <Card
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-controls={fileInputId}
      aria-disabled={disabled}
      className={cn(
        "group bg-card text-card-foreground hover:bg-muted/30 relative flex h-full min-h-64 w-full min-w-0 cursor-pointer overflow-hidden border-0 p-4 ring-0 transition-colors sm:p-6 2xl:p-8",
        isDragging && "bg-primary/10",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={openFileDialog}
      onKeyDown={handleKeyDown}
    >
      <div
        className={cn(
          "border-primary/50 flex min-h-full w-full min-w-0 flex-1 flex-col items-center justify-center border border-dashed px-4 py-8 text-center sm:px-6 sm:py-12 lg:px-10 2xl:px-14 2xl:py-16",
          isDragging && "border-primary",
        )}
      >
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          className="hidden"
          accept={accept}
          onChange={handleFileChange}
          disabled={disabled}
        />
        <div className="flex w-full min-w-0 flex-col items-center">
          <div className="mb-6 flex flex-col items-center sm:mb-9 2xl:mb-12">
            <div className="bg-muted text-foreground group-hover:bg-accent relative flex size-20 items-center justify-center border transition-colors sm:size-28 xl:size-32 2xl:size-36">
              {isDragging ? (
                <FileImageIcon
                  className="size-10 sm:size-14 xl:size-16 2xl:size-18"
                  weight="bold"
                />
              ) : (
                <UploadSimpleIcon
                  className="size-10 sm:size-14 xl:size-16 2xl:size-18"
                  weight="bold"
                />
              )}
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-col items-center gap-3 sm:gap-4 2xl:gap-5">
            <p className="text-foreground text-xl leading-tight font-black sm:text-2xl lg:text-3xl xl:text-4xl 2xl:text-5xl">
              {isDragging ? "Drop your image" : (title ?? "Drag an image")}
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed font-medium text-pretty sm:text-base lg:text-lg 2xl:text-xl">
              {description ??
                "Drop it here, or click to select a file from your device."}
            </p>

            <Button
              type="button"
              className="mt-1 h-10 w-full gap-2 px-5 font-black sm:mt-3 sm:w-auto 2xl:h-12 2xl:px-7 2xl:text-lg"
              disabled={disabled}
            >
              <ImageSquareIcon data-icon="inline-start" />
              Choose Image
            </Button>

            {details}
          </div>

          <div className="bg-background/70 text-muted-foreground text-ui-caption mt-8 flex w-full min-w-0 items-start justify-center gap-2 px-3 py-2.5 text-center font-semibold sm:mt-12 sm:px-4 lg:mt-16 2xl:mt-20 2xl:px-5 2xl:py-3">
            <LockKeyIcon
              className="mt-0.5 size-4 shrink-0 sm:size-4.5"
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
