import { colorCategory } from "../src/annotation-color.js";

// Zotero's preset highlight palette, as the reader's color picker offers it.
describe("colorCategory", () => {
  test.each([
    ["#ffd400", "Yellow"],
    ["#ff6666", "Red"],
    ["#5fb236", "Green"],
    ["#2ea8e5", "Blue"],
    ["#a28ae5", "Purple"],
    ["#e56eee", "Magenta"],
    ["#f19837", "Orange"],
    ["#aaaaaa", "Gray"],
  ])("maps Zotero preset %s to %s", (hex, name) => {
    expect(colorCategory(hex)).toBe(name);
  });

  test("is case-insensitive and tolerates a missing #", () => {
    expect(colorCategory("FFD400")).toBe("Yellow");
  });

  test("returns empty string for missing or malformed input", () => {
    expect(colorCategory("")).toBe("");
    expect(colorCategory(undefined)).toBe("");
    expect(colorCategory("#xyz")).toBe("");
  });
});
