import {
  SETTING_ZOTERO_API_KEY,
  SETTING_ZOTERO_CITATION_STYLE,
  SETTING_ZOTERO_CITATION_FORMAT,
  DEFAULT_CITATION_STYLE,
} from "../constants.js";
import { createZoteroClient, describeZoteroError } from "../zotero-client.js";
import { truncateForLabel } from "../format-citation.js";
import { CITATION_FORMATS, normalizeFormat, formatCitation } from "../cite-key.js";

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
    default:
      return `Formatted citation (${style})`;
  }
}

/**
 * Search Zotero, let the user pick a result and an output format. Shared by the
 * insertText and appOption entry points below — they differ only in what happens to the
 * result, not in how it's found. Separate app.prompt calls, not one: the spike confirmed
 * a select's options render once, statically, at prompt time — there's no live
 * re-population from what's typed in a sibling field within a single prompt.
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
  const apiKey = (app.settings[SETTING_ZOTERO_API_KEY] || "").trim();
  if (!apiKey) {
    await app.alert(`Set the "${SETTING_ZOTERO_API_KEY}" row in this plugin note's metadata table first.`);
    return null;
  }
  const style = (app.settings[SETTING_ZOTERO_CITATION_STYLE] || "").trim() || DEFAULT_CITATION_STYLE;
  const rawFormat = (app.settings[SETTING_ZOTERO_CITATION_FORMAT] || "").trim().toLowerCase();
  const fixedFormat = CITATION_FORMATS.includes(rawFormat) ? rawFormat : null;

  const queryResult = await app.prompt("Search Zotero", {
    inputs: [{ label: "Search", type: "string" }],
  });
  if (queryResult === null) return null;
  const query = (firstValue(queryResult) || "").trim();
  if (!query) return null;

  const client = createZoteroClient({ apiKey });
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
  const item = results.find((r) => r.key === firstValue(pickResult));
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

  return { ...item, format, text: formatCitation(item, format) };
}

/**
 * insertText entry point. Type the plugin's keyword (default: its name, "Zotero
 * Integration") at the cursor to trigger it. The returned string replaces that
 * expression in place — a plain-text substitution, not parsed note content
 * (docs/api-notes.md #11). Returns "" rather than undefined on cancel so the macro
 * token disappears rather than risking a literal "undefined" landing in the note —
 * which of the two actually happens is unverified until this runs live.
 */
export async function insertCitationAtCursor(app) {
  const picked = await pickCitation(app);
  return picked ? picked.text : "";
}

/**
 * appOption entry point, for quick search. insertText places text at the cursor;
 * appOption cannot (no positional write API — docs/api-notes.md #11/#17), so this
 * appends to the end of the note instead, via the one write insertNoteContent supports.
 */
export async function searchAndAppendCitation(app) {
  const picked = await pickCitation(app);
  if (!picked) return;
  await app.insertNoteContent({ uuid: app.context.noteUUID }, `${picked.text}\n`, { atEnd: true });
  await app.alert(`Appended: ${picked.text}`);
}
