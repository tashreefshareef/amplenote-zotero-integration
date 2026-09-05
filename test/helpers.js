/**
 * Mock Amplenote `app` object.
 *
 * Plugin actions can't run outside the Amplenote sandbox, so the only way to satisfy the
 * bounty's test-coverage requirement is to call them with a stand-in `app` and assert on
 * what they did to it. The mock keeps real in-memory note state rather than returning
 * canned values, so round-trip tests (write, then read back) actually exercise the logic.
 *
 * Adapted from reference/pdf-annotator/test-helpers.js — general-purpose parts kept
 * as-is; the PDF-specific attachment fixture dropped (nothing here reads attachments).
 *
 * Signatures per docs/api-notes.md's corrections log. Two behaviors modeled deliberately
 * because getting them wrong produces bugs that only appear in the real sandbox:
 *   - `prompt` returns null on cancel (not undefined)
 *   - methods take a noteHandle object `{ uuid }`, never a bare uuid string
 *
 * There is intentionally NO `notify` method — it does not exist in the real API.
 */
import { jest } from "@jest/globals";

/**
 * @param {object} options
 * @param {Array} options.notes       Seed notes: { uuid, name, content, attachments }
 * @param {Array} options.promptQueue Values returned by successive app.prompt() calls
 * @param {object} options.settings   Seed app.settings
 * @param {string} options.lightDarkMode "light" | "dark"
 */
export function createMockApp({ notes = [], promptQueue = [], settings = {}, lightDarkMode = "light" } = {}) {
  const noteMap = new Map(
    notes.map((n) => [n.uuid, { attachments: [], content: "", tags: [], ...n }])
  );

  const calls = {
    alerts: [],
    prompts: [],
    createdNotes: [],
    insertedContent: [],
    navigations: [],
  };

  const MAX_CONTENT_CHARS = 100_000;

  const handleUUID = (noteHandle) =>
    typeof noteHandle === "string" ? noteHandle : noteHandle?.uuid;

  const pending = [...promptQueue];

  const app = {
    context: {
      noteUUID: notes[0]?.uuid ?? null,
      lightDarkMode,
      embedArgs: [],
      updateEmbedArgs: jest.fn(async (...args) => {
        app.context.embedArgs = args;
      }),
      renderEmbed: jest.fn(async () => {}),
    },

    settings: { ...settings },

    // "will be synchronized to all of the user's devices"; non-string values (except
    // null) are coerced to strings — the mock coerces too, so a caller passing something
    // other than a string fails the same way it would live.
    setSetting: jest.fn(async (name, value) => {
      app.settings[name] = value === null ? null : String(value);
    }),

    alert: jest.fn(async (message) => {
      calls.alerts.push(message);
      return true;
    }),

    // Returns the next queued value; null once drained, modeling the user cancelling.
    prompt: jest.fn(async (message, options) => {
      calls.prompts.push({ message, options });
      return pending.length ? pending.shift() : null;
    }),

    getNoteContent: jest.fn(async (noteHandle) => {
      return noteMap.get(handleUUID(noteHandle))?.content ?? "";
    }),

    replaceNoteContent: jest.fn(async (noteHandle, content, opts = {}) => {
      const uuid = handleUUID(noteHandle);
      const note = noteMap.get(uuid);
      if (!note) throw new Error(`replaceNoteContent: unknown note ${uuid}`);
      if (content.length > MAX_CONTENT_CHARS) throw new Error("Content exceeds 100k characters");

      const headingText = opts.section?.heading?.text;
      if (!headingText) {
        note.content = content;
        return true;
      }

      const lines = note.content.split("\n");
      const startIdx = lines.findIndex(
        (l) => /^#{1,6}\s/.test(l) && l.replace(/^#{1,6}\s+/, "").trim() === headingText
      );
      if (startIdx === -1) throw new Error(`replaceNoteContent: no section "${headingText}"`);

      let endIdx = lines.length;
      for (let i = startIdx + 1; i < lines.length; i++) {
        if (/^#{1,6}\s/.test(lines[i])) {
          endIdx = i;
          break;
        }
      }

      note.content = [
        ...lines.slice(0, startIdx + 1),
        ...content.split("\n"),
        ...lines.slice(endIdx),
      ].join("\n");
      return true;
    }),

    // Returns nothing in the real API — do not write code that depends on a return.
    insertNoteContent: jest.fn(async (noteHandle, content, opts = {}) => {
      const uuid = handleUUID(noteHandle);
      const note = noteMap.get(uuid);
      if (!note) throw new Error(`insertNoteContent: unknown note ${uuid}`);
      if (content.length > MAX_CONTENT_CHARS) throw new Error("Content exceeds 100k characters");
      calls.insertedContent.push({ uuid, content, opts });
      note.content = opts.atEnd ? note.content + content : content + note.content;
    }),

    createNote: jest.fn(async (name, tags = [], options = {}) => {
      const uuid = `note-${noteMap.size + 1}`;
      noteMap.set(uuid, { uuid, name, tags, content: "", attachments: [] });
      calls.createdNotes.push({ uuid, name, tags, options });
      return uuid;
    }),

    findNote: jest.fn(async (noteHandle = {}) => {
      if (noteHandle.uuid) return noteMap.get(noteHandle.uuid) ?? null;
      for (const note of noteMap.values()) {
        if (note.name === noteHandle.name) return note;
      }
      return null;
    }),

    navigate: jest.fn(async (url) => {
      calls.navigations.push(url);
    }),

    // Test-only escape hatches. Not part of the real app interface.
    _notes: noteMap,
    _calls: calls,
  };

  return app;
}
