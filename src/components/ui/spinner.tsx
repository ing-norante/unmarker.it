import { cn } from "@/lib/utils";
import { SpinnerIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const { t } = useTranslation("common");
  return (
    <SpinnerIcon
      role="status"
      aria-label={t("generic.loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
