import { SYNC_NOTE_NAME, SYNC_STATE_HEADING } from "./constants.js";
import { countHeadingOccurrences, extractSectionBody, writeSection } from "./note-sections.js";

function extractJsonFence(sectionBody) {
  const match = sectionBody.match(/```(?:json)?\n([\s\S]*?)\n```/);
  return match ? match[1] : null;
}

function renderStateBody(state) {
  const json = JSON.stringify({ libraryVersion: state.libraryVersion, items: state.items }, null, 2);
  return `\nDo not edit by hand — this section stores this plugin's sync bookkeeping as JSON.\n\n\`\`\`json\n${json}\n\`\`\`\n`;
}

/**
 * Reads the key -> noteUUID map and library-version watermark this plugin persists
 * between syncs, per api-notes.md #4 (fenced code block, never bare text). Missing note,
 * missing heading, or unparsable JSON all fall back to a fresh state rather than
 * blocking the user — a corrupt watermark costs some duplicate notes on the next sync,
 * recoverable by hand, which is cheaper than a plugin that refuses to sync at all.
 *
 * A DUPLICATE heading is different: api-notes.md #4b says never assume a heading-
 * addressed write resolves to the section a heading-addressed read just returned, so
 * that case throws instead of guessing which section is authoritative.
 */
export async function loadSyncState(app) {
  const note = await app.findNote({ name: SYNC_NOTE_NAME });
  if (!note) return { noteUUID: null, libraryVersion: null, items: {} };

  const content = await app.getNoteContent({ uuid: note.uuid });
  const occurrences = countHeadingOccurrences(content, SYNC_STATE_HEADING);
  if (occurrences > 1) {
    throw new Error(
      `The "${SYNC_NOTE_NAME}" note has ${occurrences} "${SYNC_STATE_HEADING}" sections — ` +
        `delete the extra one before syncing again.`
    );
  }

  const body = occurrences === 1 ? extractSectionBody(content, SYNC_STATE_HEADING) : null;
  const json = body ? extractJsonFence(body) : null;

  let parsed = null;
  if (json) {
    try {
      parsed = JSON.parse(json);
    } catch {
      parsed = null;
    }
  }

  return {
    noteUUID: note.uuid,
    libraryVersion: parsed?.libraryVersion ?? null,
    items: parsed?.items ?? {},
  };
}

/** Writes `state` back to the sync note, creating it on the very first sync. */
export async function saveSyncState(app, state) {
  const body = renderStateBody(state);

  if (!state.noteUUID) {
    const uuid = await app.createNote(SYNC_NOTE_NAME);
    await app.insertNoteContent({ uuid }, `# ${SYNC_STATE_HEADING}\n${body}`, { atEnd: true });
    state.noteUUID = uuid;
    return;
  }

  await writeSection(app, state.noteUUID, SYNC_STATE_HEADING, body, {
    noteLabel: `The "${SYNC_NOTE_NAME}" note`,
  });
}
