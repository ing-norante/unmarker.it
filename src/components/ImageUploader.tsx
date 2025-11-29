import React, { useCallback, useState } from 'react';
import { Upload, FileImage } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from './ui/card';

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
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(false);
  }, [disabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      onImageSelect(files[0]);
    }
  }, [onImageSelect, disabled]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const files = e.target.files;
    if (files && files.length > 0) {
      onImageSelect(files[0]);
    }
  }, [onImageSelect, disabled]);

  return (
    <Card
      className={cn(
        "relative flex flex-col items-center justify-center p-10 transition-all cursor-pointer border-2 border-dashed border-black bg-white hover:bg-gray-50",
        isDragging && "bg-accent border-solid scale-[0.99]",
        disabled && "opacity-50 cursor-not-allowed hover:bg-white",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && document.getElementById('file-upload')?.click()}
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
        <div className="p-4 border-2 border-black rounded-full bg-yellow-300 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          {isDragging ? <FileImage className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
        </div>
        <div className="space-y-1">
          <p className="text-lg font-bold uppercase tracking-wide">
            {isDragging ? 'Drop it!' : 'Upload Image'}
          </p>
          <p className="text-sm text-muted-foreground">
            Drag & drop or click to select
          </p>
        </div>
      </div>
    </Card>
  );
};

