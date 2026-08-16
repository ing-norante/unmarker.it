export const homepage = {
  header: {
    product: "AI Watermark Remover",
    tagline: "Analyze, remove, and verify AI watermarks.",
    clientSide: "100% client-side.",
    privacy: "Your image stays in your browser.",
    private: "100% Private",
    fast: "Blazing Fast",
    noUploads: "No Uploads",
  },
  workflowHeading: "WORKFLOW",
  uploader: {
    title: "Drag an image",
    dragging: "Drop your image",
    description:
      "Drop it here to analyze local AI signals, then remove watermarks automatically when processing is available.",
    defaultDescription: "Drop it here, or click to select a file from your device.",
    privacy: "Your image is never uploaded. Everything runs locally in your browser.",
  },
  loading: {
    preparing: "Preparing {{fileName}}",
    description: "Loading the local image workflow...",
  },
  facts: {
    eyebrow: "Core facts",
    heading: "Client-side AI watermark analysis and removal, with no image uploads.",
    introduction:
      "Unmarker.it is a privacy-first browser tool that neutralizes invisible AI watermark signals embedded in images - no uploads, no servers, no data leaving your device. Built on adversarial disruption techniques from recent computer vision research, it applies targeted, mathematically precise perturbations directly in your browser to break machine-readable watermark patterns without visible degradation.",
    browser: {
      title: "Images stay in the browser",
      body: "Unmarker.it processes browser-decodable images locally with Canvas API operations. There are no processing uploads, server-side image endpoints, or account requirements.",
    },
    workflow: {
      title: "Analyze, remove, verify",
      body: "Upload once: Unmarker.it scans metadata and visible marks, runs the local watermark disruption pipeline when possible, then checks the generated JPEG again.",
    },
    formats: {
      title: "Supported files and output",
      body: "Processing accepts browser-readable image files up to 40 megapixels and 25 MB. Analysis-only supports PNG, JPEG, WebP, AVIF, HEIF, and JXL metadata.",
    },
    responsible: {
      title: "Designed for honest testing",
      body: "Results depend on the watermarking method, detector, input image, compression level, and downstream reuse. The tool is meant for privacy research, robustness testing, personal media workflows, and education.",
    },
  },
} as const;
