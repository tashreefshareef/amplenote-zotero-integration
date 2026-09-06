import { jest } from "@jest/globals";
import { syncLibrary } from "../src/actions/sync-library.js";
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
  data: { title: "Thinking, Fast and Slow", abstractNote: "A summary.", tags: [{ tag: "psychology" }] },
  citation: "<span>Kahneman, Thinking, Fast and Slow.</span>",
  bib: "<div>Kahneman. 2011.</div>",
  links: { alternate: { href: "https://www.zotero.org/tashreef/items/ABCD1234" } },
};

function syncStateNote({ libraryVersion, items }) {
  const json = JSON.stringify({ libraryVersion, items });
  return {
    uuid: "sync-note-1",
    name: "Zotero Sync",
    content: `# Zotero Sync State\n\n\`\`\`json\n${json}\n\`\`\`\n`,
  };
}

describe("syncLibrary", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("alerts and makes no network call when no key is configured", async () => {
    const app = createMockApp();
    const fetchImpl = mockFetchSequence();

    await syncLibrary(app);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(app._calls.alerts[0]).toMatch(/Zotero API key/i);
  });

  test("alerts and makes no network call when the sync note has duplicate headings", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      notes: [
        {
          uuid: "sync-note-1",
          name: "Zotero Sync",
          content: "# Zotero Sync State\n\n```json\n{}\n```\n\n# Zotero Sync State\n\nempty\n",
        },
      ],
    });
    const fetchImpl = mockFetchSequence();

    await syncLibrary(app);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(app._calls.alerts[0]).toMatch(/2 "Zotero Sync State" sections/);
  });

  test("first sync creates a note per item, tagged, and records the sync state", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" } });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }), // keysCurrent
      fakeResponse({ headers: { "Last-Modified-Version": "99" }, body: [KAHNEMAN] }) // items/top
    );

    await syncLibrary(app);

    expect(app._calls.createdNotes).toHaveLength(2); // the item note + the sync-state note
    const itemNoteCall = app._calls.createdNotes.find((c) => c.name === "Thinking, Fast and Slow");
    expect(itemNoteCall.tags).toEqual(["psychology"]);

    const itemNote = app._notes.get(itemNoteCall.uuid);
    expect(itemNote.content).toContain("Kahneman. 2011.");
    expect(itemNote.content).toContain("A summary.");
    expect(itemNote.content).toContain("[View in Zotero](https://www.zotero.org/tashreef/items/ABCD1234)");

    const syncNote = [...app._notes.values()].find((n) => n.name === "Zotero Sync");
    expect(syncNote.content).toContain('"libraryVersion": 99');
    expect(syncNote.content).toContain('"ABCD1234"');
    expect(syncNote.content).toContain(itemNoteCall.uuid);

    expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 1 new, 0 updated.");
  });

  test("a later sync updates the matched note in place instead of creating a duplicate", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      notes: [
        syncStateNote({ libraryVersion: 50, items: { ABCD1234: { noteUUID: "item-note-1" } } }),
        { uuid: "item-note-1", name: "Thinking, Fast and Slow", content: "stale content\n" },
      ],
    });
    const fetchImpl = mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ headers: { "Last-Modified-Version": "101" }, body: [KAHNEMAN] })
    );

    await syncLibrary(app);

    expect(app._calls.createdNotes).toHaveLength(0);
    const itemNote = app._notes.get("item-note-1");
    expect(itemNote.content).toContain("Kahneman. 2011.");
    expect(itemNote.content).not.toContain("stale content");

    const itemsUrl = new URL(fetchImpl.mock.calls[1][0].toString());
    expect(itemsUrl.searchParams.get("since")).toBe("50");

    expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 0 new, 1 updated.");
  });

  test("reports a per-item write failure instead of aborting the sync silently", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      // "missing-note" is not seeded, so replaceNoteContent throws for this item —
      // models a stored noteUUID that no longer resolves to a real note.
      notes: [syncStateNote({ libraryVersion: 50, items: { ABCD1234: { noteUUID: "missing-note" } } })],
    });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ headers: { "Last-Modified-Version": "101" }, body: [KAHNEMAN] })
    );

    await syncLibrary(app);

    const alert = app._calls.alerts.at(-1);
    expect(alert).toMatch(/0 new, 0 updated/);
    expect(alert).toMatch(/1 failed/);
    expect(alert).toMatch(/unknown note/);
  });

  test("alerts a clear message and leaves state untouched when the Zotero call fails", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      notes: [syncStateNote({ libraryVersion: 50, items: {} })],
    });
    mockFetchSequence(fakeResponse({ body: { userID: 1 } }), fakeResponse({ status: 429, headers: { "Retry-After": "20" } }));

    await syncLibrary(app);

    expect(app._calls.alerts[0]).toMatch(/rate-limited/i);
    expect(app._calls.createdNotes).toHaveLength(0);
  });
});
