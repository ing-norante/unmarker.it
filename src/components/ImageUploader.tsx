import React, { useCallback, useState } from "react";
import { Upload, FileImage } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

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
        "bg-card/80 border-border/80 hover:border-primary/40 hover:bg-card text-card-foreground hover:ring-primary/10 relative flex h-full min-h-64 w-full cursor-pointer flex-col items-center justify-center border border-dashed p-8 transition-all hover:ring-4 sm:p-10",
        isDragging &&
          "border-primary bg-primary/5 ring-primary/15 scale-[0.99] border-solid ring-4",
        disabled && "hover:bg-card cursor-not-allowed opacity-50 hover:ring-0",
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
      <input
        id="file-upload"
        type="file"
        className="hidden"
        accept="image/*"
        onChange={handleFileChange}
        disabled={disabled}
      />
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="bg-primary/10 text-primary flex size-16 items-center justify-center rounded-2xl">
          {isDragging ? (
            <FileImage className="h-8 w-8" />
          ) : (
            <Upload className="h-8 w-8" />
          )}
        </div>
        <div className="max-w-xl space-y-2">
          <p className="text-lg font-semibold">
            {isDragging ? "Drop it!" : "Upload Image"}
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            Drop an image, hit process, and get a fresh JPEG that's been shaken,
            stirred, and crushed. Designed to disrupt invisible watermark
            signals while keeping your image visually intact. No accounts, no
            image uploads, optional usage analytics.
          </p>
        </div>
      </div>
    </Card>
  );
};
