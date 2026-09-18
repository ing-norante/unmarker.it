import type {
  AiProvenanceScore,
  GeminiDetectionResult,
  MetadataScanResult,
  MetadataSignal,
  VisibleWatermarkStatus,
} from "@/lib/types";
import { message } from "@/i18n/messages";
import { isAiMetadataSignal } from "@/lib/metadata/markers";

type ProviderMatch = {
  provider: string;
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
  /trainedalgorithmicmedia/i,
  /compositewithtrainedalgorithmicmedia/i,
];

export function inferAiProvenanceScore(
  metadataScan: MetadataScanResult | null,
  geminiDetection: GeminiDetectionResult | null,
  visibleStatus: VisibleWatermarkStatus = geminiDetection
    ? geminiDetection.detected ? "detected" : "not-detected"
    : "not-scanned",
): AiProvenanceScore {
  const signals = metadataScan?.signals ?? [];
  const evidence = createEvidence(signals, geminiDetection);
  const incomplete = !metadataScan || metadataScan.warnings.length > 0 ||
    (metadataScan.c2pa && metadataScan.c2pa.verification !== "local") ||
    (visibleStatus !== "detected" && visibleStatus !== "not-detected");
  if (incomplete) {
    evidence.push(message("workflow:audit.score.evidenceIncomplete"));
  }
  const aiSignals = signals.filter(isAiMetadataSignal);
  const providerMatch = findProvider(aiSignals);
  const hasStrongProvenance =
    metadataScan?.c2pa?.aiDisclosure ||
    metadataScan?.c2pa?.origin === "ai-generated" ||
    aiSignals.some((signal) =>
      STRONG_PROVENANCE_PATTERNS.some((pattern) =>
        pattern.test(signalText(signal)),
      ),
    );
  const hasMetadataSignal = aiSignals.length > 0;

  if (hasStrongProvenance) {
    return {
      percentage: null,
      kind: "strong",
      provider: providerMatch?.provider ?? null,
      evidence,
      confidence: metadataScan?.c2pa?.integrity === "invalid" ? "low" : "medium",
    };
  }

  if (providerMatch || hasMetadataSignal) {
    return {
      percentage: null,
      kind: "metadata",
      provider: providerMatch?.provider ?? null,
      evidence,
      confidence: "medium",
    };
  }

  if (geminiDetection?.detected) {
    return {
      percentage: null,
      kind: "visible",
      provider: "Google/Gemini",
      evidence,
      confidence: "medium",
    };
  }

  if (metadataScan?.c2pa || signals.some((signal) => signal.type === "c2pa" || /c2pa/i.test(signal.marker ?? ""))) {
    return { percentage: null, kind: "credentials", provider: null, evidence, confidence: "low" };
  }

  if (incomplete) {
    return {
      percentage: null,
      kind: "incomplete",
      provider: null,
      evidence,
      confidence: "low",
    };
  }

  return {
    percentage: null,
    kind: "none",
    provider: null,
    evidence: [message("workflow:audit.score.evidenceNone")],
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

  return evidence;
}

function findProvider(signals: MetadataSignal[]): ProviderMatch | null {
  for (const signal of signals) {
    const text = signalText(signal);
    for (const [pattern, provider] of PROVIDER_PATTERNS) {
      if (pattern.test(text)) {
        return {
          provider,
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
