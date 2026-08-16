import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function AppErrorFallback() {
  const { t } = useTranslation("common");
  return (
    <div
      translate="no"
      className="bg-background text-foreground flex min-h-dvh w-full flex-col items-center justify-center gap-4 px-(--page-gutter) py-8 text-center font-sans"
    >
      <h1 className="text-2xl font-black">{t("errorBoundary.title")}</h1>
      <p className="text-muted-foreground max-w-md text-base font-medium">
        {t("errorBoundary.description")}
      </p>
      <Button onClick={() => window.location.reload()}>
        {t("errorBoundary.reload")}
      </Button>
    </div>
  );
}
