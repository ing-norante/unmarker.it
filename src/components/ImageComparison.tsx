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
    <div className="grid md:grid-cols-2 gap-6">
      {/* Original */}
      <Card className="neobrutalist-card overflow-hidden bg-white">
        <div className="bg-yellow-300 border-b-2 border-black p-2 text-center font-bold uppercase text-sm">
          Original
        </div>
        <div className="aspect-square relative flex items-center justify-center p-4 bg-gray-100/50">
          <img
            src={originalImageUrl}
            alt="Original"
            className="max-w-full max-h-full object-contain shadow-md"
          />
        </div>
      </Card>

      {/* Processed */}
      <Card className="neobrutalist-card overflow-hidden bg-white">
        <div className="bg-green-300 border-b-2 border-black p-2 text-center font-bold uppercase text-sm">
          {processedImageUrl ? "Processed Result" : "Preview"}
        </div>
        <div className="aspect-square relative flex items-center justify-center p-4 bg-gray-100/50">
          {processedImageUrl ? (
            <img
              src={processedImageUrl}
              alt="Processed"
              className="max-w-full max-h-full object-contain shadow-md"
            />
          ) : (
            <div className="text-center text-muted-foreground p-8 border-2 border-dashed border-gray-300">
              <p>Result will appear here</p>
            </div>
          )}
        </div>
        {processedImageUrl && (
          <div className="p-4 border-t-2 border-black bg-white">
            <a
              href={processedImageUrl}
              download={processedFileName}
              onClick={handleDownload}
            >
              <Button
                className="w-full font-bold border-2 border-black shadow-none hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] rounded-none"
                size="lg"
              >
                <Download className="w-4 h-4 mr-2" /> Download Processed JPEG
              </Button>
            </a>
          </div>
        )}
      </Card>
    </div>
  );
}
