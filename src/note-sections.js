/**
 * Shared heading/section utilities, used anywhere this plugin persists or updates a
 * fenced-off part of a note without touching the rest (api-notes.md #4/#4b): the
 * "Zotero Sync" bookkeeping note (sync-state.js) and each synced item's "Highlights &
 * Notes" section (Phase 4, actions/sync-library.js).
 */

export function countHeadingOccurrences(content, headingText) {
  return content
    .split("\n")
    .filter((l) => /^#{1,6}\s/.test(l) && l.replace(/^#{1,6}\s+/, "").trim() === headingText).length;
}

export function extractSectionBody(content, headingText) {
  const lines = content.split("\n");
  const startIdx = lines.findIndex(
    (l) => /^#{1,6}\s/.test(l) && l.replace(/^#{1,6}\s+/, "").trim() === headingText
  );
  if (startIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx + 1, endIdx).join("\n");
}

/**
 * Ensures `headingText` exists in the note and its body is exactly `body`, on a note
 * that already exists (this does not create the note itself — callers that might need a
 * brand new note handle that separately, since "create the note" and "keep one of its
 * sections current" are different concerns with different callers).
 *
 * api-notes.md #4b: never trust a heading-addressed write without checking the heading
 * is unique first — a duplicate throws rather than guessing which section is real.
 */
export async function writeSection(app, noteUUID, headingText, body, { headingLevel = "#", noteLabel = noteUUID } = {}) {
  const content = await app.getNoteContent({ uuid: noteUUID });
  const occurrences = countHeadingOccurrences(content, headingText);
  if (occurrences > 1) {
    throw new Error(`${noteLabel} has ${occurrences} "${headingText}" sections — delete the extra one before syncing again.`);
  }
  if (occurrences === 0) {
    await app.insertNoteContent({ uuid: noteUUID }, `\n${headingLevel} ${headingText}\n${body}`, { atEnd: true });
    return;
  }
  await app.replaceNoteContent({ uuid: noteUUID }, body, { section: { heading: { text: headingText } } });
}
