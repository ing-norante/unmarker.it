import { describe, expect, it } from "vitest";
import { prerenderedPath, staticDependencies } from "./build-artifacts";

describe("static build artifacts", () => {
  it("keeps the published homepage paths stable", () => {
    expect(prerenderedPath("en", "home")).toBe("index.html");
    expect(prerenderedPath("zh-Hans", "home")).toBe("zh-hans/index.html");
  });

  it("follows shared and cyclic static imports without preloading deferred tools", () => {
    const dependencies = staticDependencies({
      home: { file: "home.js", imports: ["shared"], dynamicImports: ["engine"] },
      shared: { file: "shared.js", imports: ["home"] },
      engine: { file: "engine.js" },
    }, "home", "shared");
    expect([...dependencies]).toEqual(["home", "shared"]);
  });

  it("rejects incomplete manifests instead of silently shipping missing preloads", () => {
    expect(() => staticDependencies({ home: { file: "home.js", imports: ["missing"] } }, "home"))
      .toThrow("Missing build chunk: missing");
  });
});
