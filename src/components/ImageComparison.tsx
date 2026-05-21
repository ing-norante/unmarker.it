import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
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
    <div className="grid gap-4 pb-2 md:grid-cols-2 md:gap-5">
      <Card className="bg-card/95 overflow-hidden">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle>Original</CardTitle>
        </CardHeader>
        <CardContent className="bg-muted/35 relative flex h-56 items-center justify-center p-3 sm:h-64 lg:h-[min(48vh,24rem)]">
          <img
            src={originalImageUrl}
            alt="Original"
            className="max-h-full max-w-full object-contain"
          />
        </CardContent>
      </Card>

      <Card className="bg-card/95 overflow-hidden">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle>
            {processedImageUrl ? "Processed result" : "Preview"}
          </CardTitle>
        </CardHeader>
        <CardContent className="bg-muted/35 relative flex h-56 items-center justify-center p-3 sm:h-64 lg:h-[min(48vh,24rem)]">
          {processedImageUrl ? (
            <img
              src={processedImageUrl}
              alt="Processed"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div className="border-border text-muted-foreground border border-dashed px-6 py-8 text-center text-sm">
              <p>Result will appear here</p>
            </div>
          )}
        </CardContent>
        {processedImageUrl && (
          <CardFooter>
            <Button asChild className="w-full font-black" size="lg">
              <a
                href={processedImageUrl}
                download={processedFileName}
                onClick={handleDownload}
              >
                <Download className="mr-2 h-4 w-4" /> Download Processed JPEG
              </a>
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
