import React, { useCallback, useId, useRef, useState } from "react";
import { FileImageIcon } from "@phosphor-icons/react/dist/ssr/FileImage";
import { ImageSquareIcon } from "@phosphor-icons/react/dist/ssr/ImageSquare";
import { LockKeyIcon } from "@phosphor-icons/react/dist/ssr/LockKey";
import { UploadSimpleIcon } from "@phosphor-icons/react/dist/ssr/UploadSimple";
import { trackAction } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface ImageUploaderProps {
  onImagesSelect: (files: File[]) => void;
  className?: string;
  disabled?: boolean;
  accept?: string;
  title?: string;
  description?: string;
  details?: React.ReactNode;
  autoFocus?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImagesSelect,
  className,
  disabled = false,
  accept = "image/*",
  title,
  description,
  details,
  autoFocus = false,
}) => {
  const { t } = useTranslation(["homepage", "common"]);
  const fileInputId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const selectFile = useCallback(
    (files: File[]) => {
      trackAction("upload_image", "uploader");
      onImagesSelect(files);
    },
    [onImagesSelect],
  );

  const openFileDialog = useCallback(() => {
    if (disabled) {
      return;
    }

    fileInputRef.current?.click();
  }, [disabled]);

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
      if (
        e.relatedTarget instanceof Node &&
        e.currentTarget.contains(e.relatedTarget)
      ) {
        return;
      }
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
        selectFile(files);
      }
    },
    [selectFile, disabled],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      const files = Array.from(e.currentTarget.files ?? []);
      // Permit selecting the same file again after a validation error.
      e.currentTarget.value = "";
      if (files.length) {
        selectFile(files);
      }
    },
    [selectFile, disabled],
  );

  return (
    <Card
      role="group"
      aria-labelledby={titleId}
      data-dragging={isDragging && !disabled}
      className={cn(
        "image-dropzone group bg-card text-card-foreground hover:bg-muted/30 relative flex h-full min-h-64 w-full min-w-0 cursor-pointer overflow-hidden border-0 p-4 ring-0 transition-colors sm:p-6 2xl:p-8",
        isDragging && "bg-primary/10",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        autoFocus={autoFocus}
        type="button"
        className="focus-visible:outline-primary-text absolute inset-0 z-10 cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-3 focus-visible:-outline-offset-3"
        aria-label={t("common:actions.chooseImage")}
        aria-describedby={descriptionId}
        aria-controls={fileInputId}
        onClick={openFileDialog}
        disabled={disabled}
      />
      <div
        className={cn(
          "dropzone-boundary border-primary/50 flex min-h-full w-full min-w-0 flex-1 flex-col items-center justify-center border border-dashed px-4 py-8 text-center sm:px-6 sm:py-12 lg:px-10 2xl:px-14 2xl:py-16",
          isDragging && "border-primary",
        )}
      >
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          multiple
          className="hidden"
          accept={accept}
          onChange={handleFileChange}
          disabled={disabled}
        />
        <div className="flex w-full min-w-0 flex-col items-center">
          <div className="mb-6 flex flex-col items-center sm:mb-9 2xl:mb-12">
            <div className="dropzone-icon bg-muted text-foreground group-hover:bg-accent relative flex size-20 items-center justify-center border sm:size-28 xl:size-32 2xl:size-36">
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
            <p
              id={titleId}
              className="text-foreground text-xl leading-snug font-black text-balance sm:text-2xl lg:text-3xl xl:text-4xl 2xl:text-5xl"
            >
              {isDragging
                ? t("homepage:uploader.dragging")
                : (title ?? t("homepage:uploader.title"))}
            </p>
            <p
              id={descriptionId}
              className="text-muted-foreground max-w-[50ch] text-base leading-relaxed font-medium text-pretty lg:text-lg 2xl:text-xl"
            >
              {description ?? t("homepage:uploader.defaultDescription")}
            </p>

            <Button
              asChild
              aria-hidden="true"
              className="mt-1 h-10 w-full gap-2 px-5 font-black sm:mt-3 sm:w-auto 2xl:h-12 2xl:px-7 2xl:text-lg"
            >
              <span>
                <ImageSquareIcon data-icon="inline-start" />
                {t("common:actions.chooseImage")}
              </span>
            </Button>

            {details}
          </div>

          <div className="bg-background/70 text-muted-foreground text-ui-caption mt-8 flex w-full min-w-0 items-start justify-center gap-2 px-3 py-2.5 text-center font-semibold sm:mt-12 sm:px-4 lg:mt-16 2xl:mt-20 2xl:px-5 2xl:py-3">
            <LockKeyIcon
              className="mt-0.5 size-4 shrink-0 sm:size-4.5"
              weight="bold"
            />
            <span className="text-pretty">
              {t("homepage:uploader.privacy")}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
