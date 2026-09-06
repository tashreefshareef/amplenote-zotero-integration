import { countHeadingOccurrences, extractSectionBody, writeSection } from "../src/note-sections.js";
import { createMockApp } from "./helpers.js";

describe("countHeadingOccurrences / extractSectionBody", () => {
  const content = "Intro text.\n\n# Section A\n\nBody A\n\n## Section B\n\nBody B\nmore B\n\n# Section A\n\nDupe\n";

  test("counts every heading matching the text, any level", () => {
    expect(countHeadingOccurrences(content, "Section A")).toBe(2);
    expect(countHeadingOccurrences(content, "Section B")).toBe(1);
    expect(countHeadingOccurrences(content, "Nope")).toBe(0);
  });

  test("extracts the body up to the next heading of any level", () => {
    expect(extractSectionBody(content, "Section B")).toBe("\nBody B\nmore B\n");
  });

  test("returns null when the heading isn't present", () => {
    expect(extractSectionBody(content, "Nope")).toBeNull();
  });
});

describe("writeSection", () => {
  test("appends the heading and body when the note has no such section yet", async () => {
    const app = createMockApp({ notes: [{ uuid: "n1", content: "Existing text.\n" }] });

    await writeSection(app, "n1", "New Section", "\nnew body\n", { headingLevel: "##" });

    const content = app._notes.get("n1").content;
    expect(content).toContain("Existing text.");
    expect(content).toContain("## New Section");
    expect(content).toContain("new body");
  });

  test("replaces just the section body in place, leaving the rest of the note alone", async () => {
    const app = createMockApp({
      notes: [{ uuid: "n1", content: "Before.\n\n## Target\n\nold body\n\n## After\n\nkept\n" }],
    });

    await writeSection(app, "n1", "Target", "\nnew body\n", { headingLevel: "##" });

    const content = app._notes.get("n1").content;
    expect(content).toContain("Before.");
    expect(content).toContain("new body");
    expect(content).not.toContain("old body");
    expect(content).toContain("## After");
    expect(content).toContain("kept");
  });

  test("throws a clear error rather than crashing when the note's content can't be read", async () => {
    const app = { getNoteContent: async () => null };

    await expect(writeSection(app, "gone-uuid", "Target", "body", { noteLabel: "That note" })).rejects.toThrow(
      /That note \(uuid gone-uuid\) could not be read/
    );
  });

  test("throws rather than guessing when the heading appears more than once", async () => {
    const app = createMockApp({
      notes: [{ uuid: "n1", content: "## Target\n\na\n\n## Target\n\nb\n" }],
    });

    await expect(writeSection(app, "n1", "Target", "new", { noteLabel: "This note" })).rejects.toThrow(
      /This note has 2 "Target" sections/
    );
  });
});
