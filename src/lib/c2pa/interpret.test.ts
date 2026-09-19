import { describe, expect, it } from "vitest";
import type { ManifestStore } from "@contentauth/c2pa-web";
import { interpretManifestStore } from "./interpret";

function store(...terms: string[]): ManifestStore {
  return {
    active_manifest: "current", validation_state: "Valid",
    manifests: { current: { assertions: [{ label: "c2pa.actions.v2", data: {
      actions: terms.map((term) => ({ action: "c2pa.created", digitalSourceType: `http://cv.iptc.org/newscodes/digitalsourcetype/${term}` })),
    } }] } },
  };
}

describe("local C2PA interpretation", () => {
  it("keeps camera provenance separate from AI and signer trust", () => {
    expect(interpretManifestStore(store("digitalCapture"))).toMatchObject({
      presence: "present", origin: "photograph", integrity: "valid", verification: "local", trust: "unknown",
      reasons: ["trust-not-evaluated"],
    });
  });

  it("reports declared AI origin without authenticating the truth of the claim", () => {
    expect(interpretManifestStore(store("trainedAlgorithmicMedia"))).toMatchObject({ origin: "ai-generated", trust: "unknown" });
  });

  it("combines capture and trained generation into a composite declaration", () => {
    expect(interpretManifestStore(store("digitalCapture", "trainedAlgorithmicMedia")).origin).toBe("composite");
  });

  it("does not classify composite capture or traditional synthetic media as AI", () => {
    expect(interpretManifestStore(store("compositeCapture"))).toMatchObject({ origin: "composite", aiDisclosure: false });
    expect(interpretManifestStore(store("compositeSynthetic"))).toMatchObject({ origin: "composite", aiDisclosure: false });
    expect(interpretManifestStore(store("compositeWithTrainedAlgorithmicMedia"))).toMatchObject({ origin: "composite", aiDisclosure: true });
  });

  it("reports altered manifests as invalid while retaining their declaration", () => {
    expect(interpretManifestStore({ ...store("trainedAlgorithmicMedia"), validation_state: "Invalid" })).toMatchObject({
      origin: "ai-generated", integrity: "invalid", verification: "failed",
      reasons: ["trust-not-evaluated", "invalid-manifest"],
    });
  });

  it("does not guess origin from a provider name, title or inactive ingredient", () => {
    const data = store();
    data.manifests!.current.title = "trainedAlgorithmicMedia OpenAI";
    data.manifests!.old = store("trainedAlgorithmicMedia").manifests!.current;
    expect(interpretManifestStore(data).origin).toBe("unknown");
  });

  it("marks inaccessible remote evidence incomplete, not validated or absent", () => {
    expect(interpretManifestStore({ validation_state: "Invalid", validation_status: [{ code: "manifest.inaccessible" }] })).toMatchObject({
      presence: "referenced", origin: "unknown", integrity: "unknown", verification: "incomplete",
    });
  });

  it("does not imply cryptographic validity from an empty validation report", () => {
    expect(interpretManifestStore({ ...store(), validation_state: null }).integrity).toBe("unknown");
  });
});
