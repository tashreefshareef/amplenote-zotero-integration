import { stripHtmlToText, truncateForLabel } from "../src/format-citation.js";

describe("stripHtmlToText", () => {
  test("strips a real Zotero citation span", () => {
    expect(stripHtmlToText('<span>Sahay, Long, and Khemani, "Computing with qLDPC Codes."</span>')).toBe(
      'Sahay, Long, and Khemani, "Computing with qLDPC Codes."'
    );
  });

  test("strips a bib entry with nested tags", () => {
    const html =
      '<div class="csl-bib-body"><div class="csl-entry">Author, A. <i>Title of the Work</i>. 2026.</div></div>';
    expect(stripHtmlToText(html)).toBe("Author, A. Title of the Work. 2026.");
  });

  test("decodes common entities", () => {
    expect(stripHtmlToText("Smith &amp; Jones &lt;ed.&gt; &quot;Quoted&quot; &#39;s")).toBe(
      `Smith & Jones <ed.> "Quoted" 's`
    );
  });

  test("collapses whitespace left behind by stripped tags", () => {
    expect(stripHtmlToText("<span>A</span>   <span>B</span>")).toBe("A B");
  });

  test("returns empty string for null/undefined/empty input", () => {
    expect(stripHtmlToText(null)).toBe("");
    expect(stripHtmlToText(undefined)).toBe("");
    expect(stripHtmlToText("")).toBe("");
  });
});

describe("truncateForLabel", () => {
  test("leaves a short string untouched", () => {
    expect(truncateForLabel("Kahneman, Thinking, Fast and Slow.")).toBe(
      "Kahneman, Thinking, Fast and Slow."
    );
  });

  test("truncates a long citation with an ellipsis, at the default length", () => {
    const long =
      'Sahay, Long, and Khemani, "Computing with qLDPC Codes by Climbing the Chain Map Hierarchy."';
    const result = truncateForLabel(long);
    expect(result.length).toBe(80);
    expect(result.endsWith("…")).toBe(true);
    expect(long.startsWith(result.slice(0, -1))).toBe(true);
  });

  test("honors a custom max length", () => {
    expect(truncateForLabel("Kahneman, Thinking, Fast and Slow.", 10)).toBe("Kahneman,…");
  });

  test("does not trim trailing whitespace left at the cut point into the ellipsis", () => {
    // Cutting exactly on a space would otherwise leave "Kahneman, …" with a stray space.
    expect(truncateForLabel("Kahneman, Thinking, Fast and Slow.", 11)).toBe("Kahneman,…");
  });

  test("returns empty string for null/undefined/empty input", () => {
    expect(truncateForLabel(null)).toBe("");
    expect(truncateForLabel(undefined)).toBe("");
    expect(truncateForLabel("")).toBe("");
  });
});
