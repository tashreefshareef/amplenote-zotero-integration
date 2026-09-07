import {
  SETTING_ZOTERO_API_KEY,
  SETTING_ZOTERO_SYNC_FILTER,
  SETTING_ZOTERO_CITATION_STYLE,
  DEFAULT_CITATION_STYLE,
  REFERENCE_HEADING,
  ZOTERO_NOTES_HEADING,
  HIGHLIGHTS_HEADING,
  MY_NOTES_HEADING,
} from "../constants.js";
import { createZoteroClient, describeZoteroError } from "../zotero-client.js";
import { loadSyncState, saveSyncState } from "../sync-state.js";
import { writeSection, countHeadingOccurrences } from "../note-sections.js";
import { parseFilterSetting, filterSignature } from "../sync-filter.js";
import { colorCategory } from "../annotation-color.js";

/**
 * Deep link into Zotero *desktop* at the highlight's own page — the same
 * `zotero://open-pdf/library/items/<attachmentKey>?page=N` the Obsidian reference plugin
 * emits per annotation. `page` is best-effort: Zotero's `annotationPosition.pageIndex`
 * is 0-based, and the open-pdf scheme takes a 1-based page number, so this sends
 * `pageIndex + 1`. ⚠️ Unverified live on two counts: whether Amplenote keeps a
 * `zotero://` (non-http) link clickable, and whether the +1 lands on the right page.
 */
function zoteroOpenLink(a) {
  if (!a.attachmentKey) return "";
  const page = Number.isInteger(a.pageIndex) ? `?page=${a.pageIndex + 1}` : "";
  return `[Open in Zotero](zotero://open-pdf/library/items/${a.attachmentKey}${page})`;
}

/**
 * Resolves the Phase 5 collections/tags/categories filter into what
 * `client.syncFilteredItems` needs. Collection NAMES -> KEYS (Zotero's collection-scoped
 * endpoint needs the key) and category NAMES -> Zotero's raw `itemType` values both need
 * a fresh lookup each run — the filter setting stores human-readable names, per
 * api-notes.md #9c, so the text field stays human-typeable. Falls back to
 * `client.syncItems` (unfiltered — this plugin's original behavior) when nothing is
 * selected.
 */
async function fetchSyncItems(client, filter, sinceVersion, style) {
  if (!filter.collections.length && !filter.tags.length && !filter.categories.length) {
    return client.syncItems({ sinceVersion, style });
  }

  let collectionKeys = [];
  if (filter.collections.length) {
    const all = await client.listCollections();
    const wanted = filter.collections.map((n) => n.toLowerCase());
    collectionKeys = all.filter((c) => wanted.includes(c.name.toLowerCase())).map((c) => c.key);
  }

  let itemTypes = [];
  if (filter.categories.length) {
    const all = await client.listItemTypes();
    const wanted = filter.categories.map((n) => n.toLowerCase());
    itemTypes = all.filter((c) => wanted.includes(c.name.toLowerCase())).map((c) => c.itemType);
  }

  return client.syncFilteredItems({ sinceVersion, collectionKeys, tagNames: filter.tags, itemTypes, style });
}

function renderAnnotation(a) {
  const page = a.pageLabel ? ` (p. ${a.pageLabel})` : "";
  // Color name first, as the reference plugin does ("**(Yellow)** - text"), then the
  // page-precise link on the same line so it stays attached to its highlight.
  const color = colorCategory(a.color);
  const label = color ? `**(${color})** ` : "";
  const link = zoteroOpenLink(a);
  const tail = link ? ` — ${link}` : "";
  // Confirmed live, 2026-09-07: a comment on its own paragraph after the blockquote
  // reads as an unrelated stray sentence, not a note on the highlight above it — label
  // it explicitly rather than relying on adjacency to imply the connection.
  if (a.text) {
    const quote = `> ${label}${a.text}${page}${tail}\n`;
    return a.comment ? `${quote}\n_Comment: ${a.comment}_\n` : quote;
  }
  if (a.comment) return `**Note${page}:** ${label}${a.comment}${tail}\n`;
  return `_${a.type || "annotation"}${page}_${tail}\n`;
}

function renderAnnotations(annotations) {
  if (!annotations.length) return "_No highlights or notes yet._\n";
  return annotations.map(renderAnnotation).join("\n");
}

function renderReference(item, extras) {
  const lines = [item.bib || item.citation || item.title];
  if (item.abstract) lines.push("", item.abstract);
  if (item.url) lines.push("", `[View in Zotero](${item.url})`);
  for (const att of extras.attachments) {
    if (att.url) lines.push("", `[View "${att.title}" in Zotero](${att.url})`);
  }
  return lines.join("\n") + "\n";
}

function renderZoteroNotes(notes) {
  if (!notes.length) return "_No Zotero notes._\n";
  return notes.map((n) => n.text).join("\n\n") + "\n";
}

const MY_NOTES_PLACEHOLDER = "_Anything you write in this section is yours — sync never touches it._\n";

/** The full note, used only at creation (and for a one-time migration of a note that
 * predates the sectioned layout). Every later write is per-section. */
function renderItemNote(item, extras) {
  return [
    `## ${REFERENCE_HEADING}`,
    "",
    renderReference(item, extras).trim(),
    "",
    `## ${ZOTERO_NOTES_HEADING}`,
    "",
    renderZoteroNotes(extras.notes).trim(),
    "",
    `## ${HIGHLIGHTS_HEADING}`,
    "",
    renderAnnotations(extras.annotations).trim(),
    "",
    `## ${MY_NOTES_HEADING}`,
    "",
    MY_NOTES_PLACEHOLDER.trim(),
    "",
  ].join("\n");
}

const EMPTY_EXTRAS = { attachments: [], annotations: [], notes: [] };

/** Falls back to an empty attachments/annotations/notes set rather than failing the
 * whole item's bibliographic sync over a children-fetch problem. */
async function getExtrasOrEmpty(client, key) {
  try {
    return await client.getItemExtras(key);
  } catch {
    return EMPTY_EXTRAS;
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

/** A note written before the sectioned layout has no `## Reference` heading. */
async function isSectioned(app, uuid) {
  const content = await app.getNoteContent({ uuid });
  return Boolean(content) && countHeadingOccurrences(content, REFERENCE_HEADING) > 0;
}

const sectionOpts = (label) => ({ headingLevel: "##", noteLabel: label });

/**
 * "Zotero: Sync now" (Phase 3 content sync + Phase 4 annotation import, roadmap.md).
 * Manual trigger rather than automatic/background — Amplenote plugins have no
 * background execution to run this on (and the Obsidian reference plugin is manual too).
 *
 * Each Zotero item becomes its own Amplenote note (so Zotero tags can map onto Amplenote
 * tags, which are per-note, not per-line), laid out in four sections: Reference
 * (bibliography, abstract, links), Zotero Notes (the item's own child notes), Highlights
 * & Notes (PDF annotations), and My Notes. **Sync only ever rewrites the first three,
 * each as a section-scoped write** — anything the user adds anywhere else in the note,
 * My Notes included, survives every re-sync. That's the Obsidian reference plugin's
 * `{% persist %}` by outcome, and it closes a real data-loss hazard the earlier
 * whole-note rewrite had. A note created before this layout (no `## Reference` heading)
 * is migrated once by whole-note rewrite — the same write it used to get every time.
 *
 * A previously-synced item is matched by key against the map in the "Zotero Sync" note
 * (sync-state.js). Re-synced items do NOT get their tags refreshed — there is no
 * confirmed Amplenote API to retag an existing note, only `createNote`'s tags argument.
 *
 * Zotero's item-level `since=` only reports a CHANGE TO THE ITEM ITSELF, not to a
 * highlight or child note added under it — so every OTHER previously-synced item (not
 * touched by this run's item-level sync) also gets its Zotero Notes and Highlights
 * sections refreshed, every run. Not incremental, by design: roughly one extra Zotero
 * request per already-synced item per manual sync, in exchange for actually catching a
 * highlight or note added without any other edit to the item.
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

  const style = (app.settings[SETTING_ZOTERO_CITATION_STYLE] || "").trim() || DEFAULT_CITATION_STYLE;

  let result;
  try {
    result = await fetchSyncItems(client, filter, sinceVersion, style);
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

      if (existing) {
        const uuid = await resolveNoteUUID(app, existing, item.title);
        if (!uuid) {
          throw new Error(`note ${existing.noteUUID} no longer exists, and no note named "${item.title}" was found to recover it`);
        }
        if (await isSectioned(app, uuid)) {
          const label = `"${item.title}"`;
          await writeSection(app, uuid, REFERENCE_HEADING, renderReference(item, extras), sectionOpts(label));
          await writeSection(app, uuid, ZOTERO_NOTES_HEADING, renderZoteroNotes(extras.notes), sectionOpts(label));
          await writeSection(app, uuid, HIGHLIGHTS_HEADING, renderAnnotations(extras.annotations), sectionOpts(label));
        } else {
          await app.replaceNoteContent({ uuid }, renderItemNote(item, extras));
        }
        existing.title = item.title;
        updated++;
      } else {
        const uuid = await app.createNote(item.title, item.tags);
        await app.insertNoteContent({ uuid }, renderItemNote(item, extras), { atEnd: true });
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
      const label = `The note for Zotero item ${key}`;
      // Zotero Notes only exists on the sectioned layout; a legacy note gets the full
      // layout on its next item-level update rather than a section appended out of order.
      if (await isSectioned(app, uuid)) {
        await writeSection(app, uuid, ZOTERO_NOTES_HEADING, renderZoteroNotes(extras.notes), sectionOpts(label));
      }
      await writeSection(app, uuid, HIGHLIGHTS_HEADING, renderAnnotations(extras.annotations), sectionOpts(label));
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
