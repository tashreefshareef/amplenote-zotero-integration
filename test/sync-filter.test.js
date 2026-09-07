import { parseFilterSetting, renderFilterSetting, filterSignature } from "../src/sync-filter.js";

describe("parseFilterSetting", () => {
  test("returns empty arrays for null/undefined/empty input", () => {
    expect(parseFilterSetting(null)).toEqual({ collections: [], tags: [] });
    expect(parseFilterSetting(undefined)).toEqual({ collections: [], tags: [] });
    expect(parseFilterSetting("")).toEqual({ collections: [], tags: [] });
  });

  test("parses both lines, comma-separated and trimmed", () => {
    const raw = "Collections: Psychology, AI Research\nTags: favorite, to-read";
    expect(parseFilterSetting(raw)).toEqual({
      collections: ["Psychology", "AI Research"],
      tags: ["favorite", "to-read"],
    });
  });

  test("tolerates only one line present", () => {
    expect(parseFilterSetting("Tags: favorite")).toEqual({ collections: [], tags: ["favorite"] });
  });

  test("is case-insensitive on the label and tolerant of stray whitespace", () => {
    expect(parseFilterSetting("  collections:  Psychology  \n  TAGS: favorite ")).toEqual({
      collections: ["Psychology"],
      tags: ["favorite"],
    });
  });

  test("ignores unrelated lines a human might have added", () => {
    expect(parseFilterSetting("Just some notes here\nTags: favorite")).toEqual({
      collections: [],
      tags: ["favorite"],
    });
  });
});

describe("renderFilterSetting", () => {
  test("round-trips through parseFilterSetting", () => {
    const filter = { collections: ["Psychology", "AI Research"], tags: ["favorite"] };
    expect(parseFilterSetting(renderFilterSetting(filter))).toEqual(filter);
  });

  test("returns an empty string for no filter", () => {
    expect(renderFilterSetting({ collections: [], tags: [] })).toBe("");
  });

  test("omits an empty line for whichever side has nothing selected", () => {
    expect(renderFilterSetting({ collections: ["Psychology"], tags: [] })).toBe("Collections: Psychology");
  });
});

describe("filterSignature", () => {
  test("is order-independent", () => {
    const a = filterSignature({ collections: ["A", "B"], tags: ["x"] });
    const b = filterSignature({ collections: ["B", "A"], tags: ["x"] });
    expect(a).toBe(b);
  });

  test("differs when the actual selection differs", () => {
    const a = filterSignature({ collections: ["A"], tags: [] });
    const b = filterSignature({ collections: ["A", "B"], tags: [] });
    expect(a).not.toBe(b);
  });
});
