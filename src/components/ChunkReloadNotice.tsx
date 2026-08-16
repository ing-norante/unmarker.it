import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ChunkReloadNotice() {
  const { t } = useTranslation("homepage");

  return (
    <div className="bg-background text-foreground flex min-h-dvh items-center justify-center p-6 font-sans">
      <Alert variant="destructive" className="max-w-md">
        <AlertTitle>{t("loadError.title")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>{t("loadError.description")}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            {t("loadError.action")}
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
