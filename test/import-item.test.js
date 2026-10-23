import { jest } from "@jest/globals";
import { importItem } from "../src/actions/import-item.js";
import { createMockApp } from "./helpers.js";

function fakeResponse({ status = 200, headers = {}, body = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function mockFetchSequence(...responses) {
  const fetchImpl = jest.fn();
  for (const r of responses) fetchImpl.mockResolvedValueOnce(r);
  jest.spyOn(globalThis, "fetch").mockImplementation(fetchImpl);
  return fetchImpl;
}

const KAHNEMAN = {
  key: "ABCD1234",
  version: 10,
  data: {
    title: "Thinking, Fast and Slow",
    abstractNote: "A summary.",
    tags: [{ tag: "psychology" }],
    DOI: "10.1000/xyz",
  },
  citation: "<span>Kahneman, Thinking, Fast and Slow.</span>",
  bib: "<div>Kahneman. 2011.</div>",
  links: { alternate: { href: "https://www.zotero.org/tashreef/items/ABCD1234" } },
};

function syncStateNote(state) {
  return {
    uuid: "sync-note-1",
    name: "Zotero Sync",
    content: `# Zotero Sync State\n\n\`\`\`json\n${JSON.stringify(state)}\n\`\`\`\n`,
  };
}

const syncStateJson = (app) => {
  const note = [...app._notes.values()].find((n) => n.name === "Zotero Sync");
  return JSON.parse(note.content.match(/```json\n([\s\S]*?)\n```/)[1]);
};

describe("importItem", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("searches, then creates the one picked item's note, records it, and opens it", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      promptQueue: ["kahneman", "ABCD1234"],
      notes: [syncStateNote({ libraryVersion: 50, items: {} })],
    });
    const fetchImpl = mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }), // keysCurrent
      fakeResponse({ body: [KAHNEMAN] }), // search
      fakeResponse({ body: KAHNEMAN }), // the one item, full
      fakeResponse({ body: [] }) // its children
    );

    await importItem(app);

    expect(fetchImpl.mock.calls[2][0].toString()).toContain("/users/1/items/ABCD1234");
    const created = app._calls.createdNotes.find((c) => c.name === "Thinking, Fast and Slow");
    expect(created.tags).toEqual(["psychology"]);
    const content = app._notes.get(created.uuid).content;
    expect(content).toContain("## Reference");
    expect(content).toContain("[DOI: 10.1000/xyz](https://doi.org/10.1000/xyz)");
    expect(content).toContain("## My Notes");

    const state = syncStateJson(app);
    expect(state.items.ABCD1234.noteUUID).toBe(created.uuid);
    // One item says nothing about the rest of the library: the watermark stays put.
    expect(state.libraryVersion).toBe(50);

    expect(app._calls.alerts.at(-1)).toBe('Imported "Thinking, Fast and Slow" into a new note.');
    expect(app._calls.navigations).toEqual([`https://www.amplenote.com/notes/${created.uuid}`]);
  });

  test("an item already synced updates its note in place, leaving My Notes alone", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      promptQueue: ["kahneman", "ABCD1234"],
      notes: [
        syncStateNote({ libraryVersion: 50, items: { ABCD1234: { noteUUID: "item-1", title: "Thinking, Fast and Slow" } } }),
        {
          uuid: "item-1",
          name: "Thinking, Fast and Slow",
          content: "## Reference\n\nold\n\n## Zotero Notes\n\n\n## Highlights & Notes\n\n\n## My Notes\n\nmine\n",
        },
      ],
    });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ body: [KAHNEMAN] }),
      fakeResponse({ body: KAHNEMAN }),
      fakeResponse({ body: [] })
    );

    await importItem(app);

    expect(app._calls.createdNotes).toHaveLength(0);
    const content = app._notes.get("item-1").content;
    expect(content).toContain("Kahneman. 2011.");
    expect(content).not.toContain("old");
    expect(content).toContain("mine");
    expect(app._calls.alerts.at(-1)).toBe('Updated the note for "Thinking, Fast and Slow".');
  });

  test("a group item is recorded with its library, so a My Library sync leaves it alone", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k", "Zotero library": "Group 30: DH" },
      promptQueue: ["kahneman", "ABCD1234"],
    });
    const fetchImpl = mockFetchSequence(
      fakeResponse({ body: [KAHNEMAN] }),
      fakeResponse({ body: KAHNEMAN }),
      fakeResponse({ body: [] })
    );

    await importItem(app);

    expect(fetchImpl.mock.calls[1][0].toString()).toContain("/groups/30/items/ABCD1234");
    expect(syncStateJson(app).items.ABCD1234.library).toBe("group:30");
  });

  test("cancelling the search changes nothing", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" }, promptQueue: [null] });
    const fetchImpl = mockFetchSequence();

    await importItem(app);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(app._calls.createdNotes).toHaveLength(0);
  });
});
