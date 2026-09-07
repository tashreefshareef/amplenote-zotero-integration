import { CITATION_FORMATS, normalizeFormat, deriveCiteKey, formatCitation } from "../src/cite-key.js";

const KAHNEMAN = {
  key: "ABCD1234",
  title: "Thinking, Fast and Slow",
  citation: "Kahneman, Thinking, Fast and Slow.",
  bib: "Kahneman, Daniel. Thinking, Fast and Slow. 2011.",
  citationKey: "",
  creators: [{ creatorType: "author", firstName: "Daniel", lastName: "Kahneman" }],
  date: "2011-10-25",
};

describe("normalizeFormat", () => {
  test("accepts every known format, case- and whitespace-insensitively", () => {
    for (const f of CITATION_FORMATS) expect(normalizeFormat(`  ${f.toUpperCase()} `)).toBe(f);
  });

  test("falls back to formatted for blank or unknown input", () => {
    expect(normalizeFormat("")).toBe("formatted");
    expect(normalizeFormat(undefined)).toBe("formatted");
    expect(normalizeFormat("nope")).toBe("formatted");
  });
});

describe("deriveCiteKey", () => {
  test("uses Zotero's native Citation Key when set", () => {
    expect(deriveCiteKey({ ...KAHNEMAN, citationKey: "kahnemanThinking2011" })).toBe("kahnemanThinking2011");
  });

  test("falls back to first author's last name + year", () => {
    expect(deriveCiteKey(KAHNEMAN)).toBe("kahneman2011");
  });

  test("strips accents and punctuation from the name, and handles single-field names", () => {
    expect(deriveCiteKey({ ...KAHNEMAN, creators: [{ lastName: "Müller-Lyer" }] })).toBe("mullerlyer2011");
    expect(deriveCiteKey({ ...KAHNEMAN, creators: [{ name: "World Health Organization" }] })).toBe(
      "worldhealthorganization2011"
    );
  });

  test("falls back to the first title word when there is no creator, then to the item key", () => {
    expect(deriveCiteKey({ ...KAHNEMAN, creators: [] })).toBe("thinking2011");
    expect(deriveCiteKey({ key: "ZZZZ9999", creators: [], title: "", date: "" })).toBe("ZZZZ9999");
  });
});

describe("formatCitation", () => {
  test.each([
    ["formatted", "Kahneman, Thinking, Fast and Slow."],
    ["bibliography", "Kahneman, Daniel. Thinking, Fast and Slow. 2011."],
    ["pandoc", "[@kahneman2011]"],
    ["latex", "\\cite{kahneman2011}"],
    ["biblatex", "\\autocite{kahneman2011}"],
  ])("%s", (format, expected) => {
    expect(formatCitation(KAHNEMAN, format)).toBe(expected);
  });

  test("bibliography falls back to the citation when bib is missing", () => {
    expect(formatCitation({ ...KAHNEMAN, bib: "" }, "bibliography")).toBe(KAHNEMAN.citation);
  });
});
