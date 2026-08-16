import { cn } from "@/lib/utils";
import { LightningIcon } from "@phosphor-icons/react/dist/ssr/Lightning";
import { LockKeyIcon } from "@phosphor-icons/react/dist/ssr/LockKey";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function Header({ className }: { className?: string }) {
  const { t } = useTranslation("homepage");
  return (
    <header
      className={cn(
        "relative flex shrink-0 flex-col gap-5 pb-1 2xl:gap-7",
        className,
      )}
    >
      <div className="flex justify-end"><LanguageSwitcher /></div>
      <div className="relative flex flex-col gap-3 2xl:gap-5">
        {/* <Sparkles className="fill-primary text-primary absolute top-0 right-10 size-5 sm:right-16" /> */}
        <h1 className="wide-hero-title text-foreground text-5xl leading-none font-black tracking-normal wrap-break-word sm:text-6xl lg:text-7xl xl:text-[5rem] 2xl:text-8xl">
          <span className="font-mono block uppercase whitespace-nowrap">
            Unmarker.it
          </span>
          <span className="locale-hero-subtitle text-primary block text-2xl leading-tight font-black sm:text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl">
            {t("header.product")}
          </span>
        </h1>
        <p className="locale-hero-copy text-muted-foreground text-xl leading-tight font-bold sm:text-2xl xl:text-3xl 2xl:text-4xl">
          {t("header.tagline")}
          <br />
          <span className="text-primary">{t("header.clientSide")}</span>{" "}
          <span className="text-muted-foreground">
            {t("header.privacy")}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:gap-4 2xl:gap-5">
        <Feature icon={ShieldCheckIcon} title={t("header.private")} />
        <Feature icon={LightningIcon} title={t("header.fast")} />
        <Feature icon={LockKeyIcon} title={t("header.noUploads")} />
      </div>
    </header>
  );
}

function Feature({
  icon: Icon,
  title,
}: {
  icon: typeof ShieldCheckIcon;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon
        className="text-foreground size-5 shrink-0 2xl:size-6"
        weight="bold"
      />
      <div className="min-w-0">
        <div className="text-foreground text-sm leading-tight font-extrabold sm:text-base 2xl:text-lg">
          {title}
        </div>
      </div>
    </div>
  );
}
