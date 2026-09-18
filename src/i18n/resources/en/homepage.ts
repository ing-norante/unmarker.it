export const homepage = {
  header: {
    product: "AI Watermark Remover",
    tagline: "Analyze, process, and check your image.",
    clientSide: "Processed in your browser.",
    privacy: "No uploads needed.",
    private: "Images Stay Local",
    fast: "No Account Needed",
    noUploads: "No Image Uploads",
  },
  workflowHeading: "WORKFLOW",
  uploader: {
    title: "Add images",
    dragging: "Drop your image",
    description:
      "Choose or drop images to analyze it and start processing automatically when supported.",
    defaultDescription: "Drop it here, or click to select a file from your device.",
    privacy: "Your image is processed in this browser and is never uploaded.",
  },
  loading: {
    preparing: "Preparing {{fileName}}",
    description: "Loading the image tools...",
  },
  loadError: {
    title: "Could not load image tools",
    description:
      "Check your connection and reload the page. This can happen after a site update.",
    action: "Reload",
  },
  facts: {
    eyebrow: "Core facts",
    heading: "Work on AI watermarks without uploading your image.",
    introduction:
      "Unmarker.it checks for AI clues in your image, attempts to remove visible Gemini / Nano Banana sparkle marks, and applies changes designed to disrupt hidden watermarks. Hidden-watermark removal cannot be confirmed by this tool.",
    browser: {
      title: "Images stay in the browser",
      body: "Image analysis and processing happen in your browser. No account or image upload is needed. When analytics is enabled, the site sends usage and error events.",
    },
    workflow: {
      title: "Analyze, process, check",
      body: "Choose an image once. The tool reads metadata (information stored in the file), checks for a Gemini sparkle mark, processes supported images, then checks the JPEG output again.",
    },
    formats: {
      title: "Supported files and output",
      body: "Process browser-readable images up to 40 megapixels and 25 MB. The output is a compressed JPEG and may lose detail. PNG, JPEG, WebP, AVIF, HEIF, and JXL also support metadata analysis when image processing is unavailable.",
    },
    responsible: {
      title: "Check the result before using it",
      body: "Compare the original and processed image before downloading. Results vary by image and watermark method; processing does not guarantee that a watermark is removed or undetectable.",
    },
  },
} as const;
