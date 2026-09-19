import type { ManifestStore } from "@contentauth/c2pa-web";
import type { C2paAudit } from "@/lib/types";

export function incompleteC2pa(
  presence: C2paAudit["presence"],
  reason: C2paAudit["reasons"][number],
): C2paAudit {
  return {
    presence, origin: "unknown", aiDisclosure: false, integrity: "unknown", verification: "incomplete",
    trust: "unknown", reasons: [reason, "trust-not-evaluated"],
  };
}

/** Read only the active manifest's typed assertions, never arbitrary text or ingredients. */
export function interpretManifestStore(store: ManifestStore): C2paAudit {
  const manifest = store.active_manifest ? store.manifests?.[store.active_manifest] : undefined;
  const statuses = [
    ...(store.validation_status ?? []),
    ...(store.validation_results?.activeManifest?.failure ?? []),
    ...(store.validation_results?.activeManifest?.informational ?? []),
  ];
  const remoteUnavailable = statuses.some(({ code }) => /manifest\.inaccessible|remote|fetch/i.test(code));
  const integrity = remoteUnavailable ? "unknown"
    : store.validation_state === "Invalid" ? "invalid"
      : manifest && (store.validation_state === "Valid" || store.validation_state === "Trusted") ? "valid"
        : "unknown";
  const reasons: C2paAudit["reasons"] = ["trust-not-evaluated"];
  if (remoteUnavailable || !manifest) reasons.push("remote-disabled");
  if (integrity === "invalid") reasons.push("invalid-manifest");

  const sources: string[] = [];
  for (const assertion of manifest?.assertions ?? []) {
    if (/^c2pa\.actions(?:\.v\d+)?$/.test(assertion.label)) {
      const data = record(assertion.data);
      if (Array.isArray(data?.actions)) {
        for (const action of data.actions) {
          const source = record(action)?.digitalSourceType;
          if (typeof source === "string") sources.push(source);
        }
      }
    } else if (assertion.label === "stds.iptc") {
      const data = record(assertion.data);
      const source = data?.digitalSourceType ?? data?.["Iptc4xmpExt:DigitalSourceType"];
      if (typeof source === "string") sources.push(source);
    }
  }
  const terms = sources.flatMap((source) => {
    const match = /^https?:\/\/cv\.iptc\.org\/newscodes\/digitalsourcetype\/([a-z]+)$/i.exec(source);
    return match ? [match[1].toLowerCase()] : [];
  });
  const ai = terms.includes("trainedalgorithmicmedia");
  const photograph = terms.includes("digitalcapture");
  const composite = terms.some((term) => ["compositewithtrainedalgorithmicmedia", "compositesynthetic", "compositecapture"].includes(term));

  return {
    presence: manifest ? "present" : "referenced",
    origin: composite || (ai && photograph) ? "composite" : ai ? "ai-generated" : photograph ? "photograph" : "unknown",
    aiDisclosure: ai || terms.includes("compositewithtrainedalgorithmicmedia"),
    integrity,
    verification: integrity === "invalid" ? "failed" : integrity === "valid" ? "local" : "incomplete",
    trust: "unknown",
    reasons,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
