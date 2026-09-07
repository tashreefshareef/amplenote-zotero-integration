/**
 * The "what to sync" setting, as a human-readable, human-editable string
 * (api-notes.md #9c: store what a human would have typed, not JSON — the settings text
 * field stays visible and editable in Amplenote's UI, so the picker (configure-sync.js)
 * and the raw text field have to be two views of the same value, not two different
 * representations). Format:
 *
 *   Collections: Psychology, AI Research
 *   Tags: favorite, to-read
 *
 * Either line may be absent. No lines (or an empty setting) means no filter — sync the
 * whole library, matching this plugin's original, pre-Phase-5 behavior.
 */

function splitNames(text) {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseFilterSetting(raw) {
  const collections = [];
  const tags = [];
  for (const line of (raw || "").split("\n")) {
    const collectionsMatch = line.match(/^\s*Collections?:\s*(.+)$/i);
    const tagsMatch = line.match(/^\s*Tags?:\s*(.+)$/i);
    if (collectionsMatch) collections.push(...splitNames(collectionsMatch[1]));
    else if (tagsMatch) tags.push(...splitNames(tagsMatch[1]));
  }
  return { collections, tags };
}

export function renderFilterSetting({ collections = [], tags = [] }) {
  const lines = [];
  if (collections.length) lines.push(`Collections: ${collections.join(", ")}`);
  if (tags.length) lines.push(`Tags: ${tags.join(", ")}`);
  return lines.join("\n");
}

/** A normalized, order-independent signature — used to detect that the ACTIVE filter
 * changed since the last sync (sync-library.js), which forces a full resync rather than
 * an incremental one: an item that predates the last sync but only just became relevant
 * under a NEWLY added collection/tag would never appear via `since=`, since its own
 * metadata hasn't changed. */
export function filterSignature(filter) {
  return JSON.stringify({
    collections: [...filter.collections].sort(),
    tags: [...filter.tags].sort(),
  });
}
