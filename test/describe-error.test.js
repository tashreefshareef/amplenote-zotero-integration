import { describeZoteroError, ZoteroApiError, ZoteroRateLimitedError } from "../src/zotero-client.js";
import { DEFAULT_CITATION_STYLE } from "../src/constants.js";

describe("describeZoteroError", () => {
  test("names the wait time on a rate limit", () => {
    expect(describeZoteroError(new ZoteroRateLimitedError(429, 30))).toMatch(/retry in 30s/);
  });

  test("blames the key only on 403", () => {
    expect(describeZoteroError(new ZoteroApiError(403))).toMatch(/rejected the API key/i);
    expect(describeZoteroError(new ZoteroApiError(404))).not.toMatch(/key/i);
    expect(describeZoteroError(new ZoteroApiError(500))).not.toMatch(/key/i);
  });

  test("names a non-default style as the likely cause of a 500 — Zotero's answer for an unloadable style", () => {
    const msg = describeZoteroError(new ZoteroApiError(500), { style: "not-a-style" });
    expect(msg).toMatch(/Is "not-a-style" a valid Zotero style id/);
  });

  test("does not blame the style when it's the default, or when the status isn't a server error", () => {
    expect(describeZoteroError(new ZoteroApiError(500), { style: DEFAULT_CITATION_STYLE })).toMatch(/server errored/i);
    expect(describeZoteroError(new ZoteroApiError(404), { style: "apa" })).not.toMatch(/style id/);
  });

  test("falls back to the raw message for a non-API failure", () => {
    expect(describeZoteroError(new Error("Failed to fetch"))).toMatch(/Could not reach Zotero: Failed to fetch/);
  });
});
