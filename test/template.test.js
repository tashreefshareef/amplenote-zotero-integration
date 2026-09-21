import { renderTemplate, normalizeTemplate } from "../src/template.js";

describe("normalizeTemplate", () => {
  test("treats a literal backslash-n as a line break (the settings field may be single-line)", () => {
    expect(normalizeTemplate("a\\nb")).toBe("a\nb");
  });

  test("leaves real newlines alone and tolerates empty input", () => {
    expect(normalizeTemplate("a\nb")).toBe("a\nb");
    expect(normalizeTemplate(null)).toBe("");
  });
});

describe("renderTemplate", () => {
  const values = { title: "Thinking, Fast and Slow", abstract: "", authors: "Daniel Kahneman", tags: "" };

  test("substitutes known placeholders", () => {
    expect(renderTemplate("# {{title}}", values)).toBe("# Thinking, Fast and Slow\n");
  });

  test("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("{{  title  }}", values)).toBe("Thinking, Fast and Slow\n");
  });

  test("drops a line whose placeholders are ALL empty — no {% if %} needed", () => {
    const out = renderTemplate("# {{title}}\n**Abstract:** {{abstract}}\nBy {{authors}}", values);
    expect(out).not.toMatch(/Abstract/);
    expect(out).toBe("# Thinking, Fast and Slow\nBy Daniel Kahneman\n");
  });

  test("keeps a line where at least one placeholder has content", () => {
    // (trailing whitespace on the output is trimmed, hence no space after the dash)
    expect(renderTemplate("{{authors}} — {{abstract}}", values)).toBe("Daniel Kahneman —\n");
  });

  test("leaves an UNKNOWN placeholder visible, so a typo is obvious instead of silent", () => {
    expect(renderTemplate("{{titel}}", values)).toBe("{{titel}}\n");
  });

  test("does not drop a line that mixes an unknown placeholder with an empty known one", () => {
    expect(renderTemplate("{{titel}} {{abstract}}", values)).toBe("{{titel}}\n");
  });

  test("collapses the gaps left by dropped lines", () => {
    const out = renderTemplate("{{title}}\n\n{{abstract}}\n\n{{authors}}", values);
    expect(out).toBe("Thinking, Fast and Slow\n\nDaniel Kahneman\n");
  });

  test("returns empty string for a blank template, so callers fall back to the built-in layout", () => {
    expect(renderTemplate("", values)).toBe("");
    expect(renderTemplate("   ", values)).toBe("");
    expect(renderTemplate(null, values)).toBe("");
  });

  test("leaves plain text untouched", () => {
    expect(renderTemplate("## Notes\n- one", values)).toBe("## Notes\n- one\n");
  });
});
