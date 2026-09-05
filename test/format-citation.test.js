import { stripHtmlToText } from "../src/format-citation.js";

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
