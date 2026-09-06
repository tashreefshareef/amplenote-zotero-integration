import { SETTING_ZOTERO_API_KEY, HIGHLIGHTS_HEADING } from "../constants.js";
import { createZoteroClient, describeZoteroError } from "../zotero-client.js";
import { loadSyncState, saveSyncState } from "../sync-state.js";
import { writeSection } from "../note-sections.js";

function renderAnnotation(a) {
  const page = a.pageLabel ? ` (p. ${a.pageLabel})` : "";
  if (a.text) return a.comment ? `> ${a.text}${page}\n\n${a.comment}\n` : `> ${a.text}${page}\n`;
  if (a.comment) return `**Note${page}:** ${a.comment}\n`;
  return `_${a.type || "annotation"}${page}_\n`;
}

function renderAnnotations(annotations) {
  if (!annotations.length) return "_No highlights or notes yet._\n";
  return annotations.map(renderAnnotation).join("\n");
}

function renderItemNote(item, extras) {
  const lines = [item.bib || item.citation || item.title];
  if (item.abstract) lines.push("", item.abstract);
  if (item.url) lines.push("", `[View in Zotero](${item.url})`);
  for (const att of extras.attachments) {
    if (att.url) lines.push("", `[View "${att.title}" in Zotero](${att.url})`);
  }
  lines.push("", `## ${HIGHLIGHTS_HEADING}`, "", renderAnnotations(extras.annotations).trim());
  return lines.join("\n") + "\n";
}

/** Falls back to an empty attachments/annotations set rather than failing the whole
 * item's bibliographic sync over an annotation-fetch problem. */
async function getExtrasOrEmpty(client, key) {
  try {
    return await client.getItemExtras(key);
  } catch {
    return { attachments: [], annotations: [] };
  }
}

/**
 * "Zotero: Sync now" (Phase 3 content sync + Phase 4 annotation import, roadmap.md).
 * Manual trigger rather than automatic/background — Amplenote plugins have no
 * background execution to run this on.
 *
 * Each Zotero item becomes its own Amplenote note (so Zotero tags can map onto Amplenote
 * tags, which are per-note, not per-line). A previously-synced item is matched by key
 * against the map in the "Zotero Sync" note (sync-state.js) and its note's content is
 * replaced wholesale; a new item creates a note and is added to the map. Re-synced items
 * do NOT get their tags refreshed — there is no confirmed Amplenote API to retag an
 * existing note, only to set tags at `createNote` time.
 *
 * Annotations (highlights, sticky notes) live in a `## Highlights & Notes` section.
 * Zotero's item-level `since=` only reports a CHANGE TO THE ITEM ITSELF, not to a
 * highlight added under one of its attachments two levels down — so a highlight-only
 * edit wouldn't be seen at all if this only touched items `since=` returned. Instead,
 * every OTHER previously-synced item (not touched by this run's bib-level sync) also
 * gets its Highlights section refreshed. This is a full annotation re-check over every
 * known item, every manual sync — not incremental — which is the deliberate trade made
 * here: it costs roughly one extra Zotero request per already-synced item on every run,
 * acceptable for a user-initiated action, in exchange for actually catching a highlight
 * added without any other edit to that item (the actual point of importing highlights).
 */
export async function syncLibrary(app) {
  const apiKey = (app.settings[SETTING_ZOTERO_API_KEY] || "").trim();
  if (!apiKey) {
    await app.alert(`Set the "${SETTING_ZOTERO_API_KEY}" row in this plugin note's metadata table first.`);
    return;
  }

  let state;
  try {
    state = await loadSyncState(app);
  } catch (e) {
    await app.alert(e.message);
    return;
  }

  const client = createZoteroClient({ apiKey });
  let result;
  try {
    result = await client.syncItems({ sinceVersion: state.libraryVersion ?? undefined });
  } catch (e) {
    await app.alert(describeZoteroError(e));
    return;
  }

  let created = 0;
  let updated = 0;
  const failures = [];
  const touchedKeys = new Set();

  for (const item of result.items) {
    touchedKeys.add(item.key);
    const existing = state.items[item.key];

    // Isolated per item: one bad write (e.g. a stored noteUUID that no longer resolves)
    // must not silently abort the rest of the sync, the way every other failure path in
    // this action alerts a clear message instead of throwing uncaught.
    try {
      const extras = await getExtrasOrEmpty(client, item.key);
      const content = renderItemNote(item, extras);

      if (existing) {
        await app.replaceNoteContent({ uuid: existing.noteUUID }, content);
        updated++;
      } else {
        const uuid = await app.createNote(item.title, item.tags);
        await app.insertNoteContent({ uuid }, content, { atEnd: true });
        state.items[item.key] = { noteUUID: uuid };
        created++;
      }
    } catch (e) {
      failures.push(`${item.title} (${e.message})`);
    }
  }

  let highlightsRefreshed = 0;
  for (const [key, { noteUUID }] of Object.entries(state.items)) {
    if (touchedKeys.has(key)) continue;
    try {
      const extras = await client.getItemExtras(key);
      await writeSection(app, noteUUID, HIGHLIGHTS_HEADING, renderAnnotations(extras.annotations), {
        headingLevel: "##",
        noteLabel: `The note for Zotero item ${key}`,
      });
      highlightsRefreshed++;
    } catch (e) {
      failures.push(`highlights for ${key} (${e.message})`);
    }
  }

  if (result.lastModifiedVersion !== null) state.libraryVersion = result.lastModifiedVersion;

  try {
    await saveSyncState(app, state);
  } catch (e) {
    await app.alert(e.message);
    return;
  }

  const summary = `Zotero sync complete: ${created} new, ${updated} updated, ${highlightsRefreshed} highlights refreshed.`;
  await app.alert(failures.length ? `${summary} ${failures.length} failed: ${failures.join("; ")}` : summary);
}
