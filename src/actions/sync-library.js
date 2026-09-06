import { SETTING_ZOTERO_API_KEY } from "../constants.js";
import { createZoteroClient, describeZoteroError } from "../zotero-client.js";
import { loadSyncState, saveSyncState } from "../sync-state.js";

function renderItemNote(item) {
  const lines = [item.bib || item.citation || item.title];
  if (item.abstract) lines.push("", item.abstract);
  if (item.url) lines.push("", `[View in Zotero](${item.url})`);
  return lines.join("\n") + "\n";
}

/**
 * "Zotero: Sync now" (trimmed-scope Phase 3, roadmap.md). Manual trigger rather than
 * automatic/background — Amplenote plugins have no background execution to run this on.
 *
 * Each Zotero item becomes its own Amplenote note (so Zotero tags can map onto Amplenote
 * tags, which are per-note, not per-line). A previously-synced item is matched by key
 * against the map in the "Zotero Sync" note (sync-state.js) and its note's content is
 * replaced wholesale; a new item creates a note and is added to the map. Re-synced items
 * do NOT get their tags refreshed — there is no confirmed Amplenote API to retag an
 * existing note, only to set tags at `createNote` time.
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
  for (const item of result.items) {
    const content = renderItemNote(item);
    const existing = state.items[item.key];

    if (existing) {
      await app.replaceNoteContent({ uuid: existing.noteUUID }, content);
      updated++;
    } else {
      const uuid = await app.createNote(item.title, item.tags);
      await app.insertNoteContent({ uuid }, content, { atEnd: true });
      state.items[item.key] = { noteUUID: uuid };
      created++;
    }
  }

  if (result.lastModifiedVersion !== null) state.libraryVersion = result.lastModifiedVersion;

  try {
    await saveSyncState(app, state);
  } catch (e) {
    await app.alert(e.message);
    return;
  }

  await app.alert(`Zotero sync complete: ${created} new, ${updated} updated.`);
}
