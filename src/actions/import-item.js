import { SETTING_ZOTERO_CITATION_STYLE, DEFAULT_CITATION_STYLE } from "../constants.js";
import { describeZoteroError } from "../zotero-client.js";
import { loadSyncState, saveSyncState } from "../sync-state.js";
import { libraryStateKey } from "../library.js";
import { connect } from "../setup.js";
import { searchAndPick } from "./citation-picker.js";
import { syncItemNote, readTemplates } from "./sync-library.js";

/**
 * "Zotero: Import item". Search, pick one reference, and sync just that item into its
 * note — the same note, layout and bookkeeping Sync now would give it, without syncing
 * the rest of the library or touching the sync filter. Run it again on the same item
 * and it updates the note rather than making a second one.
 *
 * Leaves the library watermark alone: one item says nothing about what else changed, so
 * the next Sync now still pulls everything since the last full run. The item joins the
 * map in "Zotero Sync", so Sync now's refresh pass keeps its highlights current from
 * then on even when the sync filter wouldn't include it.
 */
export async function importItem(app) {
  const connection = await connect(app);
  if (!connection) return;
  const { client, library } = connection;
  const style = (app.settings[SETTING_ZOTERO_CITATION_STYLE] || "").trim() || DEFAULT_CITATION_STYLE;

  const picked = await searchAndPick(app, client, style);
  if (!picked) return;

  let state;
  try {
    state = await loadSyncState(app);
  } catch (e) {
    await app.alert(e.message);
    return;
  }

  let item;
  try {
    item = await client.getSyncItem(picked.key, { style });
  } catch (e) {
    await app.alert(describeZoteroError(e, { style }));
    return;
  }

  let outcome;
  try {
    outcome = await syncItemNote(app, client, item, state, readTemplates(app), libraryStateKey(library));
    await saveSyncState(app, state);
  } catch (e) {
    await app.alert(`Couldn't import "${item.title}": ${e.message}`);
    return;
  }

  await app.alert(outcome.status === "created" ? `Imported "${item.title}" into a new note.` : `Updated the note for "${item.title}".`);
  await app.navigate(`https://www.amplenote.com/notes/${outcome.uuid}`);
}
