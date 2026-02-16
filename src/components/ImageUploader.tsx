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
        "border-foreground bg-background hover:bg-muted relative flex cursor-pointer flex-col items-center justify-center border-2 border-dashed p-10 transition-all",
        isDragging && "bg-accent scale-[0.99] border-solid",
        disabled && "hover:bg-background cursor-not-allowed opacity-50",
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
        <div className="border-foreground rounded-full border-2 bg-yellow-300 p-4 shadow-[4px_4px_0px_0px_rgba(var(--neo-shadow),1)] dark:bg-yellow-400">
          {isDragging ? (
            <FileImage className="h-8 w-8 text-black" />
          ) : (
            <Upload className="h-8 w-8 text-black" />
          )}
        </div>
        <div className="space-y-1">
          <p className="text-lg font-bold tracking-wide uppercase">
            {isDragging ? "Drop it!" : "Upload Image"}
          </p>
          <p className="text-muted-foreground text-sm">
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
