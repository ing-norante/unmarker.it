const HOMEPAGE_FACTS = [
  {
    title: "Images stay in the browser",
    body: "Unmarker.it processes browser-decodable images locally with Canvas API operations. There are no processing uploads, server-side image endpoints, or account requirements.",
  },
  {
    title: "Analyze, remove, verify",
    body: "Upload once: Unmarker.it scans metadata and visible marks, runs the local watermark disruption pipeline when possible, then checks the generated JPEG again.",
  },
  {
    title: "Supported files and output",
    body: "Processing accepts browser-readable image files up to 40 megapixels and 25 MB. Analysis-only supports PNG, JPEG, WebP, AVIF, HEIF, and JXL metadata.",
  },
  {
    title: "Designed for honest testing",
    body: "Results depend on the watermarking method, detector, input image, compression level, and downstream reuse. The tool is meant for privacy research, robustness testing, personal media workflows, and education.",
  },
] as const;

export function HomepageFacts() {
  return (
    <section
      aria-labelledby="homepage-facts-heading"
      className="w-full border-t pt-8"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(22rem,0.75fr)_minmax(0,1.25fr)] lg:gap-10 2xl:grid-cols-[minmax(34rem,0.7fr)_minmax(0,1.3fr)] 2xl:gap-14">
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-ui-overline">Core facts</p>
          <h2
            id="homepage-facts-heading"
            className="text-foreground text-2xl leading-tight font-black sm:text-3xl xl:text-4xl 2xl:text-5xl"
          >
            Client-side AI watermark analysis and removal, with no image
            uploads.
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed font-medium sm:text-base 2xl:text-lg">
            Unmarker.it is a privacy-first browser tool that neutralizes
            invisible AI watermark signals embedded in images - no uploads, no
            servers, no data leaving your device. Built on adversarial
            disruption techniques from recent computer vision research, it
            applies targeted, mathematically precise perturbations directly in
            your browser to break machine-readable watermark patterns without
            visible degradation.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 2xl:gap-4">
          {HOMEPAGE_FACTS.map((fact) => (
            <article
              key={fact.title}
              className="bg-card text-card-foreground flex min-h-36 flex-col gap-2 border p-4 2xl:min-h-44 2xl:p-5"
            >
              <h3 className="text-base leading-tight font-black sm:text-lg 2xl:text-2xl">
                {fact.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed font-medium sm:text-base 2xl:text-lg">
                {fact.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
