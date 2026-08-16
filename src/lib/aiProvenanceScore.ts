import type {
  AiProvenanceScore,
  GeminiDetectionResult,
  MetadataScanResult,
  MetadataSignal,
} from "@/lib/types";
import { message } from "@/i18n/messages";

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
      kind: "strong",
      provider: providerMatch?.provider ?? null,
      evidence,
      confidence: "high",
    };
  }

  if (providerMatch || hasMetadataSignal) {
    return {
      percentage: providerMatch ? 88 : 78,
      kind: "metadata",
      provider: providerMatch?.provider ?? null,
      evidence,
      confidence: "medium",
    };
  }

  if (geminiDetection?.detected) {
    const percentage = Math.min(
      94,
      Math.max(35, Math.round(geminiDetection.confidence * 100)),
    );

    return {
      percentage,
      kind: "visible",
      provider: "Google/Gemini",
      evidence,
      confidence: "medium",
    };
  }

  return {
    percentage: 12,
    kind: "none",
    provider: null,
    evidence,
    confidence: "low",
  };
}

function createEvidence(
  signals: MetadataSignal[],
  geminiDetection: GeminiDetectionResult | null,
) {
  const evidence = signals.map((signal) => signal.label);

  if (geminiDetection?.detected) {
    evidence.push(message("workflow:audit.score.evidenceGemini", {
      confidence: Math.round(geminiDetection.confidence * 100),
    }));
  }

  if (evidence.length === 0) {
    evidence.push(message("workflow:audit.score.evidenceNone"));
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
  return [signal.type, signal.location, signal.marker]
    .filter(Boolean)
    .join(" ");
}
