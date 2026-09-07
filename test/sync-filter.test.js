import { parseFilterSetting, renderFilterSetting, filterSignature } from "../src/sync-filter.js";

describe("parseFilterSetting", () => {
  test("returns empty arrays for null/undefined/empty input", () => {
    expect(parseFilterSetting(null)).toEqual({ collections: [], tags: [], categories: [] });
    expect(parseFilterSetting(undefined)).toEqual({ collections: [], tags: [], categories: [] });
    expect(parseFilterSetting("")).toEqual({ collections: [], tags: [], categories: [] });
  });

  test("parses all three lines, comma-separated and trimmed", () => {
    const raw = "Collections: Psychology, AI Research\nTags: favorite, to-read\nCategories: Journal Article, Book";
    expect(parseFilterSetting(raw)).toEqual({
      collections: ["Psychology", "AI Research"],
      tags: ["favorite", "to-read"],
      categories: ["Journal Article", "Book"],
    });
  });

  test("tolerates only one line present", () => {
    expect(parseFilterSetting("Tags: favorite")).toEqual({ collections: [], tags: ["favorite"], categories: [] });
    expect(parseFilterSetting("Category: Book")).toEqual({ collections: [], tags: [], categories: ["Book"] });
  });

  test("is case-insensitive on the label and tolerant of stray whitespace", () => {
    expect(parseFilterSetting("  collections:  Psychology  \n  TAGS: favorite \n categories: Book")).toEqual({
      collections: ["Psychology"],
      tags: ["favorite"],
      categories: ["Book"],
    });
  });

  test("ignores unrelated lines a human might have added", () => {
    expect(parseFilterSetting("Just some notes here\nTags: favorite")).toEqual({
      collections: [],
      tags: ["favorite"],
      categories: [],
    });
  });
});

describe("renderFilterSetting", () => {
  test("round-trips through parseFilterSetting", () => {
    const filter = { collections: ["Psychology", "AI Research"], tags: ["favorite"], categories: ["Book"] };
    expect(parseFilterSetting(renderFilterSetting(filter))).toEqual(filter);
  });

  test("returns an empty string for no filter", () => {
    expect(renderFilterSetting({ collections: [], tags: [], categories: [] })).toBe("");
  });

  test("omits lines for whichever side has nothing selected", () => {
    expect(renderFilterSetting({ collections: ["Psychology"], tags: [], categories: [] })).toBe("Collections: Psychology");
  });
});

describe("filterSignature", () => {
  test("is order-independent", () => {
    const a = filterSignature({ collections: ["A", "B"], tags: ["x"], categories: ["Book"] });
    const b = filterSignature({ collections: ["B", "A"], tags: ["x"], categories: ["Book"] });
    expect(a).toBe(b);
  });

  test("differs when the actual selection differs, including categories", () => {
    const a = filterSignature({ collections: ["A"], tags: [], categories: [] });
    const b = filterSignature({ collections: ["A"], tags: [], categories: ["Book"] });
    expect(a).not.toBe(b);
  });

  test("tolerates a missing categories field (pre-Phase-5-categories saved state)", () => {
    expect(() => filterSignature({ collections: [], tags: [] })).not.toThrow();
  });
});
