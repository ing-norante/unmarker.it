import type {
  AiProvenanceScore,
  GeminiDetectionResult,
  MetadataScanResult,
  MetadataSignal,
} from "@/lib/types";

type ProviderMatch = {
  provider: string;
  confidenceBand: "strong" | "provider";
};

const PROVIDER_PATTERNS: Array<[RegExp, string]> = [
  [/\b(dall[-_\s]?e|openai)\b/i, "OpenAI"],
  [/\bmidjourney\b/i, "Midjourney"],
  [
    /\b(stable[-_\s]?diffusion|automatic1111|sd:[a-z0-9_:-]+)/i,
    "Stable Diffusion",
  ],
  [/\bcomfyui\b/i, "ComfyUI"],
  [/\b(synthid|google[-_\s]?ai|imagen|gemini)\b/i, "Google/Gemini"],
  [/\bfirefly\b/i, "Adobe Firefly"],
];

const STRONG_PROVENANCE_PATTERNS = [
  /\bc2pa\b/i,
  /trainedalgorithmicmedia/i,
  /algorithmicmedia/i,
  /compositesynthetic/i,
  /compositewithtrainedalgorithmicmedia/i,
];

export function inferAiProvenanceScore(
  metadataScan: MetadataScanResult | null,
  geminiDetection: GeminiDetectionResult | null,
): AiProvenanceScore {
  const signals = metadataScan?.signals ?? [];
  const evidence = createEvidence(signals, geminiDetection);
  const providerMatch = findProvider(signals);
  const hasStrongProvenance =
    signals.some((signal) => signal.type === "c2pa") ||
    signals.some((signal) =>
      STRONG_PROVENANCE_PATTERNS.some((pattern) =>
        pattern.test(signalText(signal)),
      ),
    );
  const hasMetadataSignal = signals.length > 0;

  if (hasStrongProvenance) {
    return {
      percentage: providerMatch ? 98 : 96,
      label: "Strong local AI evidence",
      provider: providerMatch?.provider ?? "Unknown AI tool",
      evidence,
      confidence: "high",
      description:
        "Local provenance or C2PA-style AI metadata was found in the file.",
    };
  }

  if (providerMatch || hasMetadataSignal) {
    return {
      percentage: providerMatch ? 88 : 78,
      label: "AI metadata signals found",
      provider: providerMatch?.provider ?? "Unknown AI tool",
      evidence,
      confidence: "medium",
      description:
        "Local metadata markers suggest this image passed through an AI generation workflow.",
    };
  }

  if (geminiDetection?.detected) {
    const percentage = Math.min(
      94,
      Math.max(35, Math.round(geminiDetection.confidence * 100)),
    );

    return {
      percentage,
      label: "Visible AI watermark evidence",
      provider: "Google/Gemini",
      evidence,
      confidence: "medium",
      description:
        "A Gemini-style visible watermark was detected locally. No strong metadata provenance was found.",
    };
  }

  return {
    percentage: 12,
    label: "No local AI signals found",
    provider: null,
    evidence,
    confidence: "low",
    description:
      "This does not prove the image is human-made; it only means local metadata and visible watermark checks found no AI signal.",
  };
}

function createEvidence(
  signals: MetadataSignal[],
  geminiDetection: GeminiDetectionResult | null,
) {
  const evidence = signals.map((signal) =>
    signal.marker
      ? `${signal.label}: ${signal.marker}`
      : `${signal.label} in ${signal.location}`,
  );

  if (geminiDetection?.detected) {
    evidence.push(
      `Gemini visible watermark (${Math.round(geminiDetection.confidence * 100)}%)`,
    );
  }

  if (evidence.length === 0) {
    evidence.push("No local metadata or visible watermark signal detected");
  }

  return evidence;
}

function findProvider(signals: MetadataSignal[]): ProviderMatch | null {
  for (const signal of signals) {
    const text = signalText(signal);
    for (const [pattern, provider] of PROVIDER_PATTERNS) {
      if (pattern.test(text)) {
        return {
          provider,
          confidenceBand: signal.type === "c2pa" ? "strong" : "provider",
        };
      }
    }
  }

  return null;
}

function signalText(signal: MetadataSignal) {
  return [signal.type, signal.label, signal.location, signal.marker]
    .filter(Boolean)
    .join(" ");
}
