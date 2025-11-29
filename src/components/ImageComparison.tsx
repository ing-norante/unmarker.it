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
      <Card className="neobrutalist-card overflow-hidden bg-white">
        <div className="border-b-2 border-black bg-yellow-300 p-2 text-center text-sm font-bold uppercase">
          Original
        </div>
        <div className="relative flex aspect-square items-center justify-center bg-gray-100/50 p-4">
          <img
            src={originalImageUrl}
            alt="Original"
            className="max-h-full max-w-full object-contain shadow-md"
          />
        </div>
      </Card>

      {/* Processed */}
      <Card className="neobrutalist-card overflow-hidden bg-white">
        <div className="border-b-2 border-black bg-green-300 p-2 text-center text-sm font-bold uppercase">
          {processedImageUrl ? "Processed Result" : "Preview"}
        </div>
        <div className="relative flex aspect-square items-center justify-center bg-gray-100/50 p-4">
          {processedImageUrl ? (
            <img
              src={processedImageUrl}
              alt="Processed"
              className="max-h-full max-w-full object-contain shadow-md"
            />
          ) : (
            <div className="text-muted-foreground border-2 border-dashed border-gray-300 p-8 text-center">
              <p>Result will appear here</p>
            </div>
          )}
        </div>
        {processedImageUrl && (
          <div className="border-t-2 border-black bg-white p-4">
            <a
              href={processedImageUrl}
              download={processedFileName}
              onClick={handleDownload}
            >
              <Button
                className="w-full rounded-none border-2 border-black font-bold shadow-none hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
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
