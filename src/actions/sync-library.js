import { SETTING_ZOTERO_API_KEY, SETTING_ZOTERO_SYNC_FILTER, HIGHLIGHTS_HEADING } from "../constants.js";
import { createZoteroClient, describeZoteroError } from "../zotero-client.js";
import { loadSyncState, saveSyncState } from "../sync-state.js";
import { writeSection } from "../note-sections.js";
import { parseFilterSetting, filterSignature } from "../sync-filter.js";

/**
 * Resolves the Phase 5 collections/tags filter into what `client.syncFilteredItems`
 * needs (collection NAMES -> KEYS — the filter setting stores names, per api-notes.md
 * #9c, so the text field stays human-typeable; Zotero's collection-scoped endpoint
 * needs the key). Falls back to `client.syncItems` (unfiltered — this plugin's original
 * behavior) when nothing is selected.
 */
async function fetchSyncItems(client, filter, sinceVersion) {
  if (!filter.collections.length && !filter.tags.length) {
    return client.syncItems({ sinceVersion });
  }
  let collectionKeys = [];
  if (filter.collections.length) {
    const all = await client.listCollections();
    const wanted = filter.collections.map((n) => n.toLowerCase());
    collectionKeys = all.filter((c) => wanted.includes(c.name.toLowerCase())).map((c) => c.key);
  }
  return client.syncFilteredItems({ sinceVersion, collectionKeys, tagNames: filter.tags });
}

function renderAnnotation(a) {
  const page = a.pageLabel ? ` (p. ${a.pageLabel})` : "";
  // Confirmed live, 2026-09-07: a comment on its own paragraph after the blockquote
  // reads as an unrelated stray sentence, not a note on the highlight above it — label
  // it explicitly rather than relying on adjacency to imply the connection.
  if (a.text) return a.comment ? `> ${a.text}${page}\n\n_Comment: ${a.comment}_\n` : `> ${a.text}${page}\n`;
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
 * Confirmed live, 2026-09-06: `app.createNote`'s returned uuid is not durable. It comes
 * back prefixed `local-...` and gets swapped for a different, permanent uuid once the
 * note finishes syncing to Amplenote's backend — so a uuid saved straight from
 * `createNote` and trusted forever silently stops resolving. Before writing to a stored
 * uuid, confirm it still exists; if not, re-find the note by its name and heal the
 * stored mapping (mutates `entry` in place) so future syncs use the corrected uuid.
 * Returns null if the note is genuinely gone (or was renamed AND its uuid drifted,
 * which this can't recover from — the caller reports that as a failure).
 */
async function resolveNoteUUID(app, entry, title) {
  if (await app.findNote({ uuid: entry.noteUUID })) return entry.noteUUID;
  if (!title) return null;
  const byName = await app.findNote({ name: title });
  if (!byName) return null;
  entry.noteUUID = byName.uuid;
  return byName.uuid;
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
  const filter = parseFilterSetting(app.settings[SETTING_ZOTERO_SYNC_FILTER]);
  const signature = filterSignature(filter);
  // A changed filter needs a full resync, not an incremental one: an item that predates
  // the last sync but only just became relevant under a newly-added collection/tag
  // would never come back via since=, since its own metadata hasn't changed.
  const filterChanged = state.filterSignature !== undefined && state.filterSignature !== signature;
  const sinceVersion = filterChanged ? undefined : state.libraryVersion ?? undefined;

  let result;
  try {
    result = await fetchSyncItems(client, filter, sinceVersion);
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
        const uuid = await resolveNoteUUID(app, existing, item.title);
        if (!uuid) {
          throw new Error(`note ${existing.noteUUID} no longer exists, and no note named "${item.title}" was found to recover it`);
        }
        await app.replaceNoteContent({ uuid }, content);
        existing.title = item.title;
        updated++;
      } else {
        const uuid = await app.createNote(item.title, item.tags);
        await app.insertNoteContent({ uuid }, content, { atEnd: true });
        state.items[item.key] = { noteUUID: uuid, title: item.title };
        created++;
      }
    } catch (e) {
      failures.push(`${item.title} (${e.message})`);
    }
  }

  let highlightsRefreshed = 0;
  for (const [key, entry] of Object.entries(state.items)) {
    if (touchedKeys.has(key)) continue;
    try {
      // Older entries predate title tracking. Backfill from Zotero itself (the item key
      // is always a reliable handle) so resolveNoteUUID has a name to fall back on —
      // note-uuid resolution has been observed to fail intermittently for a uuid that
      // resolves fine moments before/after, so this fallback needs to actually work, not
      // just exist for a one-time migration.
      if (!entry.title) {
        try {
          entry.title = (await client.getItem(key)).title;
        } catch {
          // leave it unset; resolveNoteUUID just can't fall back to a name this time
        }
      }
      const uuid = await resolveNoteUUID(app, entry, entry.title);
      if (!uuid) {
        const named = entry.title ? `, and no note named "${entry.title}" was found to recover it` : "";
        throw new Error(`note ${entry.noteUUID} no longer exists${named}`);
      }
      const extras = await client.getItemExtras(key);
      await writeSection(app, uuid, HIGHLIGHTS_HEADING, renderAnnotations(extras.annotations), {
        headingLevel: "##",
        noteLabel: `The note for Zotero item ${key}`,
      });
      highlightsRefreshed++;
    } catch (e) {
      failures.push(`highlights for ${key} (${e.message})`);
    }
  }

  if (result.lastModifiedVersion !== null) state.libraryVersion = result.lastModifiedVersion;
  state.filterSignature = signature;

  try {
    await saveSyncState(app, state);
  } catch (e) {
    await app.alert(e.message);
    return;
  }

  const summary = `Zotero sync complete: ${created} new, ${updated} updated, ${highlightsRefreshed} highlights refreshed.`;
  await app.alert(failures.length ? `${summary} ${failures.length} failed: ${failures.join("; ")}` : summary);
}
