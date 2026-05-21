import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { DownloadSimpleIcon, ImageSquareIcon } from "@phosphor-icons/react";
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
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ImageSquareIcon />
                </EmptyMedia>
                <EmptyTitle>Result will appear here</EmptyTitle>
                <EmptyDescription>
                  Run the pipeline to generate a processed JPEG.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
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
                <DownloadSimpleIcon data-icon="inline-start" />
                Download Processed JPEG
              </a>
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
