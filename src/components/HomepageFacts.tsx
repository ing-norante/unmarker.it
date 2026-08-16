import { useTranslation } from "react-i18next";

const FACTS = ["browser", "workflow", "formats", "responsible"] as const;

export function HomepageFacts() {
  const { t } = useTranslation("homepage");
  return (
    <section
      aria-labelledby="homepage-facts-heading"
      className="w-full border-t pt-8"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(22rem,0.75fr)_minmax(0,1.25fr)] lg:gap-10 2xl:grid-cols-[minmax(34rem,0.7fr)_minmax(0,1.3fr)] 2xl:gap-14">
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-ui-overline">{t("facts.eyebrow")}</p>
          <h2
            id="homepage-facts-heading"
            className="locale-facts-heading text-foreground text-2xl leading-tight font-black sm:text-3xl xl:text-4xl 2xl:text-5xl"
          >
            {t("facts.heading")}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed font-medium sm:text-base 2xl:text-lg">
            {t("facts.introduction")}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 2xl:gap-4">
          {FACTS.map((fact) => (
            <article
              key={fact}
              className="bg-card text-card-foreground flex flex-col gap-2 border p-4 2xl:p-5"
            >
              <h3 className="locale-fact-title text-base leading-tight font-black sm:text-lg 2xl:text-2xl">
                {t(`facts.${fact}.title`)}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed font-medium sm:text-base 2xl:text-lg">
                {t(`facts.${fact}.body`)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
