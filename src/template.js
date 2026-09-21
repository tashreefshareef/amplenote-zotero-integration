/**
 * A deliberately tiny template substituter — the Obsidian reference plugin's templating
 * by outcome, without its engine.
 *
 * Why not Nunjucks (what that plugin uses): it is on the order of 100 KB minified, and
 * api-notes.md #2 records a hard ceiling — Plugin Builder refuses to sync a code block
 * over 100k characters (`MAX_REPLACE_CONTENT_LENGTH = 1e5` in its own source). This
 * plugin's whole bundle is ~19 kB today; bundling an engine would break GitHub sync
 * outright and add to the tab-freeze cost of api-notes.md #1. What people actually use
 * those templates for is choosing which fields appear and in what order, which needs
 * substitution, not evaluation.
 *
 * Syntax, all of it:
 *   {{name}}   replaced by that value
 *
 * Two behaviors that remove the need for an `{% if %}`:
 *   - **A line whose placeholders ALL resolved empty is dropped**, so `**Abstract:**
 *     {{abstract}}` simply vanishes for an item with no abstract, instead of leaving a
 *     dangling label. A line keeps its place if any one of its placeholders has content.
 *   - **An UNKNOWN placeholder is left as written** (`{{titel}}` stays `{{titel}}`)
 *     rather than silently blanking, so a typo is visible in the note instead of
 *     quietly eating a field.
 */

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/**
 * Amplenote's settings fields are single-line — confirmed live 2026-09-21, Enter inserts
 * no newline (api-notes.md #9c). So a literal backslash-n in the setting is how a user
 * writes a line break. A real newline is accepted too, for a value written some other way.
 */
export function normalizeTemplate(raw) {
  return (raw || "").replace(/\\n/g, "\n");
}

export function renderTemplate(raw, values) {
  const template = normalizeTemplate(raw);
  if (!template.trim()) return "";

  const lines = template.split("\n").map((line) => {
    const keys = [...line.matchAll(PLACEHOLDER)].map((m) => m[1]);
    const known = keys.filter((k) => Object.prototype.hasOwnProperty.call(values, k));

    // Every placeholder on this line is a known field, and all of them are empty — the
    // line exists only to present absent data, so drop it rather than leave a stub.
    if (known.length && known.length === keys.length) {
      const allEmpty = known.every((k) => !String(values[k] ?? "").trim());
      if (allEmpty) return null;
    }

    return line.replace(PLACEHOLDER, (whole, key) =>
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? "") : whole
    );
  });

  return (
    lines
      .filter((l) => l !== null)
      .join("\n")
      // dropped lines can leave a gap; markdown only ever needs one blank line
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}
