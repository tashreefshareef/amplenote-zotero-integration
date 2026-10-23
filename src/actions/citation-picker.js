import { SETTING_ZOTERO_CITATION_STYLE, SETTING_ZOTERO_CITATION_FORMAT, DEFAULT_CITATION_STYLE } from "../constants.js";
import { describeZoteroError } from "../zotero-client.js";
import { truncateForLabel } from "../format-citation.js";
import { CITATION_FORMATS, normalizeFormat, formatCitation } from "../cite-key.js";
import { connect } from "../setup.js";

// zotero-findings.md confirmed a `string` and a `select` input coexisting in ONE
// app.prompt returns a positional array. It did not test a prompt with a SINGLE input —
// unconfirmed whether that returns a bare value or a one-element array. Handle both
// until a live run settles it (see docs/development.md's live-check step for this phase).
function firstValue(promptResult) {
  return Array.isArray(promptResult) ? promptResult[0] : promptResult;
}

function formatLabel(format, style) {
  switch (format) {
    case "bibliography":
      return "Bibliography entry";
    case "pandoc":
      return "Pandoc  [@key]";
    case "latex":
      return "LaTeX  \\cite{key}";
    case "biblatex":
      return "BibLaTeX  \\autocite{key}";
    case "bibtex":
      return "BibTeX entry  @article{key, ...}";
    default:
      return `Formatted citation (${style})`;
  }
}

/**
 * The search box and the results list, shared by the citation picker and "Zotero:
 * Import item". Separate app.prompt calls, not one: the spike confirmed a select's
 * options render once, statically, at prompt time — there's no live re-population from
 * what's typed in a sibling field within a single prompt.
 *
 * Returns the picked search result (searchItems' shape), or null when the user
 * cancelled or nothing matched — the reason has already been shown.
 */
export async function searchAndPick(app, client, style) {
  const queryResult = await app.prompt("Search Zotero", {
    inputs: [{ label: "Search", type: "string" }],
  });
  if (queryResult === null) return null;
  const query = (firstValue(queryResult) || "").trim();
  if (!query) return null;

  let results;
  try {
    results = await client.searchItems({ query, style });
  } catch (e) {
    await app.alert(describeZoteroError(e, { style }));
    return null;
  }
  if (!results.length) {
    await app.alert(`No Zotero items matched "${query}".`);
    return null;
  }

  const pickResult = await app.prompt(`Results for "${query}"`, {
    inputs: [
      {
        label: "Reference",
        type: "select",
        // Full citation stays on the result object for insertion — only the label
        // shown in the dropdown is shortened.
        options: results.map((r) => ({ label: truncateForLabel(r.citation || r.title), value: r.key })),
      },
    ],
  });
  if (pickResult === null) return null;
  return results.find((r) => r.key === firstValue(pickResult)) || null;
}

/**
 * Search Zotero, let the user pick a result and an output format. Shared by the
 * insertText and appOption entry points below — they differ only in what happens to the
 * result, not in how it's found.
 *
 * The citation STYLE (any CSL id Zotero's `style=` accepts) comes from a setting. The
 * FORMAT (cite-key.js's CITATION_FORMATS) comes from a setting when one is set — no
 * extra prompt — and is otherwise asked for in its own single-select prompt after the
 * reference is picked. Confirmed live, 2026-09-07: a prompt declaring TWO `select`
 * inputs rendered only the first (a `string` + a `select` together is fine — Phase 0
 * spike #4), so the format can't ride along in the results prompt as a second select.
 *
 * Returns the picked item plus `format` and `text` (the string to insert), or null.
 */
export async function pickCitation(app) {
  const connection = await connect(app);
  if (!connection) return null;
  const { client } = connection;
  const style = (app.settings[SETTING_ZOTERO_CITATION_STYLE] || "").trim() || DEFAULT_CITATION_STYLE;
  const rawFormat = (app.settings[SETTING_ZOTERO_CITATION_FORMAT] || "").trim().toLowerCase();
  const fixedFormat = CITATION_FORMATS.includes(rawFormat) ? rawFormat : null;

  const item = await searchAndPick(app, client, style);
  if (!item) return null;

  let format = fixedFormat;
  if (!format) {
    const formatResult = await app.prompt("Insert as", {
      inputs: [
        {
          label: "Format",
          type: "select",
          options: CITATION_FORMATS.map((f) => ({ label: formatLabel(f, style), value: f })),
        },
      ],
    });
    if (formatResult === null) return null;
    format = normalizeFormat(firstValue(formatResult));
  }

  if (format === "bibtex") {
    try {
      item.bibtex = await client.getBibtex(item.key);
    } catch (e) {
      await app.alert(describeZoteroError(e));
      return null;
    }
    if (!item.bibtex) {
      await app.alert(`Zotero returned no BibTeX entry for "${item.title}".`);
      return null;
    }
  }

  return { ...item, format, text: formatCitation(item, format) };
}

/**
 * insertText entry point. Type the plugin's keyword (default: its name, "Zotero
 * Integration") at the cursor to trigger it. The returned string replaces that
 * expression in place — a plain-text substitution, not parsed note content
 * (docs/api-notes.md #11). Returns "" rather than undefined on cancel so the macro
 * token disappears rather than risking a literal "undefined" landing in the note.
 * Confirmed live on Android, 2026-10-11: cancelling the results list removed the
 * `/zotero` token and left nothing behind.
 */
export async function insertCitationAtCursor(app) {
  const picked = await pickCitation(app);
  return picked ? picked.text : "";
}

/**
 * appOption entry point, for quick search. insertText places text at the cursor;
 * appOption cannot (no positional write API — docs/api-notes.md #11/#17), so this
 * appends to the end of the note instead, via the one write insertNoteContent supports.
 *
 * An appOption can run with no note in context: confirmed live 2026-10-10 on Android,
 * launched from the search overlay with a note open. insertNoteContent with no uuid
 * doesn't throw — it creates a new untitled note and the "Appended" alert lies. So
 * refuse up front, before the user spends a search on it.
 */
export async function searchAndAppendCitation(app) {
  const noteUUID = app.context?.noteUUID;
  if (!noteUUID) {
    await app.alert(
      "No open note to add the citation to. Open a note and type /zotero to insert a citation at the cursor."
    );
    return;
  }
  const picked = await pickCitation(app);
  if (!picked) return;

  // insertNoteContent parses markdown, so a BibTeX entry can go in as a real code block.
  if (picked.format === "bibtex") {
    await app.insertNoteContent({ uuid: noteUUID }, "```bibtex\n" + picked.text + "\n```\n", { atEnd: true });
    await app.alert(`Appended the BibTeX entry for "${picked.title}".`);
    return;
  }
  await app.insertNoteContent({ uuid: noteUUID }, `${picked.text}\n`, { atEnd: true });
  await app.alert(`Appended: ${picked.text}`);
}
