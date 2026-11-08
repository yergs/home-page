import { assertEquals, assertStringIncludes } from "@std/assert";
import { Either, Schema } from "effect";
import { decodeManifestModule, defineManifest, type Registry, widgetBundleUrl } from "./widgets.ts";

const manifest = defineManifest({
  title: "Clock",
  description: "Shows the time",
  config: Schema.Struct({ zone: Schema.String }),
  defaultConfig: { zone: "UTC" },
});

Deno.test("decodeManifestModule accepts a module exporting a manifest", () => {
  const decoded = decodeManifestModule({ manifest });
  assertEquals(Either.isRight(decoded) && decoded.right.config === manifest.config, true);
});

Deno.test("decodeManifestModule says what's wrong with a bad manifest", async (t) => {
  const failure = (module: unknown) => {
    const result = decodeManifestModule(module);
    return Either.isLeft(result) ? result.left : "decoded";
  };
  await t.step("no manifest export", () => {
    assertStringIncludes(failure({}), "manifest");
  });
  await t.step("a blank title", () => {
    assertStringIncludes(failure({ manifest: { ...manifest, title: " " } }), "title");
  });
  await t.step("a config that isn't a schema", () => {
    assertStringIncludes(
      failure({ manifest: { ...manifest, config: { zone: "string" } } }),
      "Schema",
    );
  });
});

Deno.test("a manifest may declare the outside services it sends data to", async (t) => {
  const service = {
    name: "Geocoder",
    sends: "Street addresses",
    privacyPolicy: "https://example.com/privacy",
    terms: "https://example.com/terms",
  };
  const decode = (permissions: unknown) =>
    decodeManifestModule({ manifest: { ...manifest, permissions } });
  await t.step("a list of services", () => {
    const decoded = decode({ services: [service] });
    assertEquals(Either.isRight(decoded) && decoded.right.permissions, { services: [service] });
  });
  await t.step("none, by leaving it out", () => {
    const decoded = decodeManifestModule({ manifest });
    assertEquals(Either.isRight(decoded) && decoded.right.permissions, undefined);
  });
  await t.step("but not an empty list, or a policy that isn't https", () => {
    const failure = (permissions: unknown) => {
      const result = decode(permissions);
      return Either.isLeft(result) ? result.left : "decoded";
    };
    assertStringIncludes(failure({ services: [] }), "services");
    assertStringIncludes(failure({ services: [{ ...service, terms: "http://x" }] }), "https://");
  });
});

Deno.test("widgetBundleUrl versions the URL from the registry", () => {
  const registry: Registry = {
    widgets: [{
      id: "clock",
      title: "",
      description: "",
      version: "abc",
      configSchema: {},
      defaultConfig: {},
      permissions: null,
      agents: {},
      apis: [],
      fullScreen: { width: "full", height: "full" },
      ruleBelow: true,
    }],
  };
  assertEquals(
    widgetBundleUrl(registry, "clock"),
    Either.right("/web/assets/widgets/clock/main.js?v=abc"),
  );
  assertEquals(
    widgetBundleUrl(registry, "gone"),
    Either.left(`There's no widget type called "gone"`),
  );
});
