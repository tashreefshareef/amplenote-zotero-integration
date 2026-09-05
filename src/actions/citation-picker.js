import { SETTING_ZOTERO_API_KEY } from "../constants.js";
import { createZoteroClient, ZoteroApiError, ZoteroRateLimitedError } from "../zotero-client.js";
import { truncateForLabel } from "../format-citation.js";

function errorMessage(e) {
  if (e instanceof ZoteroRateLimitedError) {
    return `Zotero rate-limited this request — retry in ${e.retryAfterSeconds}s.`;
  }
  if (e instanceof ZoteroApiError) return `Zotero API error (HTTP ${e.status}). Check the key is current.`;
  return `Could not reach Zotero: ${e.message}`;
}

// zotero-findings.md confirmed a `string` and a `select` input coexisting in ONE
// app.prompt returns a positional array. It did not test a prompt with a SINGLE input —
// unconfirmed whether that returns a bare value or a one-element array. Handle both
// until a live run settles it (see docs/development.md's live-check step for this phase).
function firstValue(promptResult) {
  return Array.isArray(promptResult) ? promptResult[0] : promptResult;
}

/**
 * Search Zotero, let the user pick a result. Shared by the insertText and appOption
 * entry points below — they differ only in what happens to the result, not in how it's
 * found. Two separate app.prompt calls, not one: the spike confirmed a select's options
 * render once, statically, at prompt time — there's no live re-population from what's
 * typed in a sibling field within a single prompt.
 */
export async function pickCitation(app) {
  const apiKey = (app.settings[SETTING_ZOTERO_API_KEY] || "").trim();
  if (!apiKey) {
    await app.alert(`Set the "${SETTING_ZOTERO_API_KEY}" row in this plugin note's metadata table first.`);
    return null;
  }

  const queryResult = await app.prompt("Search Zotero", {
    inputs: [{ label: "Search", type: "string" }],
  });
  if (queryResult === null) return null;
  const query = (firstValue(queryResult) || "").trim();
  if (!query) return null;

  const client = createZoteroClient({ apiKey });
  let results;
  try {
    results = await client.searchItems({ query });
  } catch (e) {
    await app.alert(errorMessage(e));
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
  const key = firstValue(pickResult);

  return results.find((r) => r.key === key) ?? null;
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
  return picked ? picked.citation : "";
}

/**
 * appOption entry point, for quick search. insertText places text at the cursor;
 * appOption cannot (no positional write API — docs/api-notes.md #11/#17), so this
 * appends to the end of the note instead, via the one write insertNoteContent supports.
 */
export async function searchAndAppendCitation(app) {
  const picked = await pickCitation(app);
  if (!picked) return;
  await app.insertNoteContent({ uuid: app.context.noteUUID }, `${picked.citation}\n`, { atEnd: true });
  await app.alert(`Appended: ${picked.citation}`);
}
