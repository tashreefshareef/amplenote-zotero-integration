import { loadSyncState, saveSyncState } from "../src/sync-state.js";
import { createMockApp } from "./helpers.js";

describe("loadSyncState", () => {
  test("returns fresh empty state when no sync note exists", async () => {
    const app = createMockApp();

    const state = await loadSyncState(app);

    expect(state).toEqual({ noteUUID: null, libraryVersion: null, items: {} });
  });

  test("parses a previously saved state back out", async () => {
    const saved = { libraryVersion: 42, items: { ABCD: { noteUUID: "note-2" } } };
    const app = createMockApp({
      notes: [
        {
          uuid: "note-1",
          name: "Zotero Sync",
          content: `# Zotero Sync State\n\nDo not edit by hand.\n\n\`\`\`json\n${JSON.stringify(saved)}\n\`\`\`\n`,
        },
      ],
    });

    const state = await loadSyncState(app);

    expect(state).toEqual({ noteUUID: "note-1", libraryVersion: 42, items: { ABCD: { noteUUID: "note-2" } } });
  });

  test("falls back to fresh state on unparsable JSON, rather than throwing", async () => {
    const app = createMockApp({
      notes: [{ uuid: "note-1", name: "Zotero Sync", content: "# Zotero Sync State\n\n```json\nnot json\n```\n" }],
    });

    const state = await loadSyncState(app);

    expect(state).toEqual({ noteUUID: "note-1", libraryVersion: null, items: {} });
  });

  test("falls back to fresh state when the heading exists but has no fence yet", async () => {
    const app = createMockApp({
      notes: [{ uuid: "note-1", name: "Zotero Sync", content: "# Zotero Sync State\n\nnothing here yet\n" }],
    });

    const state = await loadSyncState(app);

    expect(state).toEqual({ noteUUID: "note-1", libraryVersion: null, items: {} });
  });

  test("throws rather than guessing when the heading appears twice", async () => {
    const app = createMockApp({
      notes: [
        {
          uuid: "note-1",
          name: "Zotero Sync",
          content: "# Zotero Sync State\n\n```json\n{}\n```\n\n# Zotero Sync State\n\nempty\n",
        },
      ],
    });

    await expect(loadSyncState(app)).rejects.toThrow(/2 "Zotero Sync State" sections/);
  });

  test("falls back to fresh state, rather than crashing, when the note is found but unreadable", async () => {
    const app = { findNote: async () => ({ uuid: "note-1" }), getNoteContent: async () => null };

    const state = await loadSyncState(app);

    expect(state).toEqual({ noteUUID: "note-1", libraryVersion: null, items: {} });
  });
});

describe("saveSyncState", () => {
  test("creates the sync note on the very first save", async () => {
    const app = createMockApp();
    const state = { noteUUID: null, libraryVersion: 7, items: { ABCD: { noteUUID: "note-2" } } };

    await saveSyncState(app, state);

    expect(state.noteUUID).toBeTruthy();
    const note = app._notes.get(state.noteUUID);
    expect(note.name).toBe("Zotero Sync");
    expect(note.content).toContain("# Zotero Sync State");
    expect(note.content).toContain('"libraryVersion": 7');
    expect(note.content).toContain('"ABCD"');
  });

  test("round-trips through load after a save", async () => {
    const app = createMockApp();
    const state = { noteUUID: null, libraryVersion: 1, items: { X: { noteUUID: "note-2" } } };

    await saveSyncState(app, state);
    const reloaded = await loadSyncState(app);

    expect(reloaded).toEqual({ noteUUID: state.noteUUID, libraryVersion: 1, items: { X: { noteUUID: "note-2" } } });
  });

  test("updates the section in place on a later save, leaving the rest of the note alone", async () => {
    const app = createMockApp({
      notes: [
        {
          uuid: "note-1",
          name: "Zotero Sync",
          content: "Some human note above.\n\n# Zotero Sync State\n\n```json\n{\"libraryVersion\":1,\"items\":{}}\n```\n",
        },
      ],
    });
    const state = { noteUUID: "note-1", libraryVersion: 2, items: { Y: { noteUUID: "note-9" } } };

    await saveSyncState(app, state);

    const content = app._notes.get("note-1").content;
    expect(content).toContain("Some human note above.");
    expect(content).toContain('"libraryVersion": 2');
    expect(content).toContain('"Y"');
  });

  test("re-adds the heading if the note exists but lost it", async () => {
    const app = createMockApp({ notes: [{ uuid: "note-1", name: "Zotero Sync", content: "Just some text.\n" }] });
    const state = { noteUUID: "note-1", libraryVersion: 3, items: {} };

    await saveSyncState(app, state);

    const content = app._notes.get("note-1").content;
    expect(content).toContain("Just some text.");
    expect(content).toContain("# Zotero Sync State");
  });

  test("throws rather than writing when the heading appears twice", async () => {
    const app = createMockApp({
      notes: [
        {
          uuid: "note-1",
          name: "Zotero Sync",
          content: "# Zotero Sync State\n\n```json\n{}\n```\n\n# Zotero Sync State\n\nempty\n",
        },
      ],
    });
    const state = { noteUUID: "note-1", libraryVersion: 1, items: {} };

    await expect(saveSyncState(app, state)).rejects.toThrow(/2 "Zotero Sync State" sections/);
  });
});
