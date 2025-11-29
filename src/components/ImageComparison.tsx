import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Download } from "lucide-react";
import { usePostHog } from "posthog-js/react";

interface ImageComparisonProps {
  originalImageUrl: string;
  processedImageUrl: string | null;
  processedFileName: string | null;
}

export function ImageComparison({
  originalImageUrl,
  processedImageUrl,
  processedFileName,
}: ImageComparisonProps) {
  const posthog = usePostHog();

  const handleDownload = () => {
    posthog?.capture("action_clicked", {
      action: "download_processed",
      component: "image_comparison",
    });
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Original */}
      <Card className="neobrutalist-card bg-background overflow-hidden">
        <div className="border-foreground border-b-2 bg-yellow-300 p-2 text-center text-sm font-bold text-black uppercase dark:bg-yellow-400">
          Original
        </div>
        <div className="bg-muted/50 relative flex aspect-square items-center justify-center p-4">
          <img
            src={originalImageUrl}
            alt="Original"
            className="max-h-full max-w-full object-contain shadow-md"
          />
        </div>
      </Card>

      {/* Processed */}
      <Card className="neobrutalist-card bg-background overflow-hidden">
        <div className="border-foreground border-b-2 bg-green-300 p-2 text-center text-sm font-bold text-black uppercase dark:bg-green-400">
          {processedImageUrl ? "Processed Result" : "Preview"}
        </div>
        <div className="bg-muted/50 relative flex aspect-square items-center justify-center p-4">
          {processedImageUrl ? (
            <img
              src={processedImageUrl}
              alt="Processed"
              className="max-h-full max-w-full object-contain shadow-md"
            />
          ) : (
            <div className="text-muted-foreground border-muted-foreground/30 border-2 border-dashed p-8 text-center">
              <p>Result will appear here</p>
            </div>
          )}
        </div>
        {processedImageUrl && (
          <div className="border-foreground bg-background border-t-2 p-4">
            <a
              href={processedImageUrl}
              download={processedFileName}
              onClick={handleDownload}
            >
              <Button
                className="border-foreground w-full rounded-none border-2 font-bold shadow-none hover:shadow-[2px_2px_0px_0px_rgba(var(--neo-shadow),1)]"
                size="lg"
              >
                <Download className="mr-2 h-4 w-4" /> Download Processed JPEG
              </Button>
            </a>
          </div>
        )}
      </Card>
    </div>
  );
}
