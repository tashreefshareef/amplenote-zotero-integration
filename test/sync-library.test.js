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

function syncStateNote({ libraryVersion, items, filterSignature }) {
  const json = JSON.stringify({ libraryVersion, items, filterSignature });
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

    expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 1 new, 0 updated, 0 highlights refreshed.");
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

    expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 0 new, 1 updated, 0 highlights refreshed.");
  });

  test("a new item note includes its attachment link and imported highlights", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" } });
    const attachment = {
      key: "ATT1",
      data: { itemType: "attachment", title: "Kahneman.pdf" },
      links: { alternate: { href: "https://www.zotero.org/tashreef/items/ATT1" } },
    };
    const annotation = {
      key: "ANN1",
      data: {
        itemType: "annotation",
        annotationType: "highlight",
        annotationText: "System 1 and System 2",
        annotationComment: "key idea",
        annotationPageLabel: "12",
        annotationSortIndex: "00001",
      },
    };
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }), // keysCurrent
      fakeResponse({ headers: { "Last-Modified-Version": "99" }, body: [KAHNEMAN] }), // items/top
      fakeResponse({ body: [attachment] }), // children of the item
      fakeResponse({ body: [annotation] }) // children of the attachment
    );

    await syncLibrary(app);

    const itemNoteCall = app._calls.createdNotes.find((c) => c.name === "Thinking, Fast and Slow");
    const content = app._notes.get(itemNoteCall.uuid).content;
    expect(content).toContain('[View "Kahneman.pdf" in Zotero](https://www.zotero.org/tashreef/items/ATT1)');
    expect(content).toContain("## Highlights & Notes");
    expect(content).toContain("> System 1 and System 2 (p. 12)");
    expect(content).toContain("_Comment: key idea_");
    expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 1 new, 0 updated, 0 highlights refreshed.");
  });

  test("refreshes highlights for a previously-synced item this run's item sync didn't touch", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      notes: [
        syncStateNote({
          libraryVersion: 50,
          items: { OTHR1: { noteUUID: "item-note-2", title: "Some Other Item" } },
        }),
        {
          uuid: "item-note-2",
          name: "Some Other Item",
          content: "Old bib.\n\n## Highlights & Notes\n\n_No highlights or notes yet._\n",
        },
      ],
    });
    const attachment = { key: "ATT2", data: { itemType: "attachment", title: "Other.pdf" }, links: {} };
    const annotation = {
      key: "ANN2",
      data: { itemType: "annotation", annotationType: "highlight", annotationText: "A new highlight", annotationSortIndex: "00001" },
    };
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }), // keysCurrent
      fakeResponse({ headers: { "Last-Modified-Version": "50" }, body: [] }), // items/top — nothing changed
      fakeResponse({ body: [attachment] }), // children of OTHR1
      fakeResponse({ body: [annotation] }) // children of the attachment
    );

    await syncLibrary(app);

    const content = app._notes.get("item-note-2").content;
    expect(content).toContain("Old bib."); // untouched outside the section
    expect(content).toContain("> A new highlight");
    expect(content).not.toContain("No highlights or notes yet");
    expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 0 new, 0 updated, 1 highlights refreshed.");
  });

  test("backfills a missing title from Zotero itself before attempting recovery", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      notes: [
        // No title stored — predates title tracking.
        syncStateNote({ libraryVersion: 50, items: { OTHR1: { noteUUID: "stale-uuid-3" } } }),
        {
          uuid: "real-uuid-3",
          name: "Some Other Item",
          content: "Old bib.\n\n## Highlights & Notes\n\n_No highlights or notes yet._\n",
        },
      ],
    });
    const attachment = { key: "ATT3", data: { itemType: "attachment", title: "Other.pdf" }, links: {} };
    const annotation = {
      key: "ANN3",
      data: { itemType: "annotation", annotationType: "highlight", annotationText: "backfilled highlight", annotationSortIndex: "1" },
    };
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }), // keysCurrent
      fakeResponse({ headers: { "Last-Modified-Version": "50" }, body: [] }), // items/top — nothing changed
      fakeResponse({ body: { key: "OTHR1", data: { title: "Some Other Item" } } }), // getItem title backfill
      fakeResponse({ body: [attachment] }), // children of OTHR1
      fakeResponse({ body: [annotation] }) // children of the attachment
    );

    await syncLibrary(app);

    expect(app._notes.get("real-uuid-3").content).toContain("backfilled highlight");
    expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 0 new, 0 updated, 1 highlights refreshed.");

    const syncNote = [...app._notes.values()].find((n) => n.name === "Zotero Sync");
    expect(syncNote.content).toContain('"title": "Some Other Item"');
    expect(syncNote.content).toContain('"noteUUID": "real-uuid-3"');
  });

  test("reports a per-item write failure when a stale noteUUID can't be recovered by name either", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      // "missing-note" resolves to nothing, and no note is named "Thinking, Fast and
      // Slow" either — models a stored noteUUID that's gone stale with no way back.
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
    expect(alert).toMatch(/no longer exists/);
  });

  test("self-heals a stale stored noteUUID by re-finding the note by name", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      notes: [
        syncStateNote({
          libraryVersion: 50,
          items: { ABCD1234: { noteUUID: "stale-uuid", title: "Thinking, Fast and Slow" } },
        }),
        // createNote's uuid isn't durable (confirmed live, 2026-09-06) — this is the
        // note's real, current uuid, unrelated to the stale one stored above.
        { uuid: "real-uuid", name: "Thinking, Fast and Slow", content: "old content\n" },
      ],
    });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ headers: { "Last-Modified-Version": "101" }, body: [KAHNEMAN] })
    );

    await syncLibrary(app);

    expect(app._calls.createdNotes).toHaveLength(0); // recovered, not recreated (sync-state note already existed too)
    expect(app._notes.get("real-uuid").content).toContain("Kahneman. 2011.");

    const syncNote = [...app._notes.values()].find((n) => n.name === "Zotero Sync");
    expect(syncNote.content).toContain('"noteUUID": "real-uuid"');
    expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 0 new, 1 updated, 0 highlights refreshed.");
  });

  test("self-heals during a highlights-only refresh too, using the item's persisted title", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      notes: [
        syncStateNote({
          libraryVersion: 50,
          items: { OTHR1: { noteUUID: "stale-uuid-2", title: "Some Other Item" } },
        }),
        {
          uuid: "real-uuid-2",
          name: "Some Other Item",
          content: "Old bib.\n\n## Highlights & Notes\n\n_No highlights or notes yet._\n",
        },
      ],
    });
    const attachment = { key: "ATT2", data: { itemType: "attachment", title: "Other.pdf" }, links: {} };
    const annotation = {
      key: "ANN2",
      data: { itemType: "annotation", annotationType: "highlight", annotationText: "recovered highlight", annotationSortIndex: "1" },
    };
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }), // keysCurrent
      fakeResponse({ headers: { "Last-Modified-Version": "50" }, body: [] }), // items/top — nothing changed
      fakeResponse({ body: [attachment] }), // children of OTHR1
      fakeResponse({ body: [annotation] }) // children of the attachment
    );

    await syncLibrary(app);

    const content = app._notes.get("real-uuid-2").content;
    expect(content).toContain("Old bib.");
    expect(content).toContain("recovered highlight");
    expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 0 new, 0 updated, 1 highlights refreshed.");
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

  describe("Phase 5 filtering", () => {
    test("with a collections+tags filter set, routes through the filtered fetch instead of the plain one", async () => {
      const app = createMockApp({
        settings: { "Zotero API key": "k", "Zotero sync filter": "Collections: Psychology\nTags: favorite" },
      });
      const fetchImpl = mockFetchSequence(
        fakeResponse({ body: { userID: 1 } }), // keysCurrent
        fakeResponse({ body: [{ key: "C1", data: { name: "Psychology" } }] }), // listCollections
        fakeResponse({ headers: { "Last-Modified-Version": "5" }, body: [KAHNEMAN] }), // collection C1
        fakeResponse({ body: [] }) // tag-filtered items/top
      );

      await syncLibrary(app);

      expect(fetchImpl.mock.calls[1][0].toString()).toContain("/users/1/collections"); // listCollections, not items/top
      const collectionUrl = fetchImpl.mock.calls[2][0].toString();
      expect(collectionUrl).toContain("/users/1/collections/C1/items/top");
      const tagUrl = new URL(fetchImpl.mock.calls[3][0].toString());
      expect(tagUrl.searchParams.get("tag")).toBe("favorite");
      expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 1 new, 0 updated, 0 highlights refreshed.");
    });

    test("with only a categories filter set, resolves item types and routes through the filtered fetch", async () => {
      const app = createMockApp({
        settings: { "Zotero API key": "k", "Zotero sync filter": "Categories: Journal Article" },
      });
      const fetchImpl = mockFetchSequence(
        fakeResponse({ body: [{ itemType: "journalArticle", localized: "Journal Article" }] }), // listItemTypes
        fakeResponse({ body: { userID: 1 } }), // keysCurrent (inside syncFilteredItems)
        fakeResponse({ headers: { "Last-Modified-Version": "5" }, body: [KAHNEMAN] }) // itemType-filtered items/top
      );

      await syncLibrary(app);

      expect(new URL(fetchImpl.mock.calls[0][0].toString()).pathname).toBe("/itemTypes");
      const url = new URL(fetchImpl.mock.calls[2][0].toString());
      expect(url.pathname).toBe("/users/1/items/top");
      expect(url.searchParams.get("itemType")).toBe("journalArticle");
      expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 1 new, 0 updated, 0 highlights refreshed.");
    });

    test("a changed filter forces a full resync (since= omitted) even with a stored libraryVersion", async () => {
      const app = createMockApp({
        settings: { "Zotero API key": "k", "Zotero sync filter": "Tags: favorite" },
        notes: [syncStateNote({ libraryVersion: 50, items: {}, filterSignature: '{"collections":[],"tags":["old-tag"]}' })],
      });
      const fetchImpl = mockFetchSequence(
        fakeResponse({ body: { userID: 1 } }),
        fakeResponse({ body: [] }) // tag-filtered items/top (no collections selected here)
      );

      await syncLibrary(app);

      const url = new URL(fetchImpl.mock.calls[1][0].toString());
      expect(url.searchParams.has("since")).toBe(false);
    });

    test("an unchanged filter still syncs incrementally, since= intact", async () => {
      const signature = '{"collections":[],"tags":["favorite"],"categories":[]}';
      const app = createMockApp({
        settings: { "Zotero API key": "k", "Zotero sync filter": "Tags: favorite" },
        notes: [syncStateNote({ libraryVersion: 50, items: {}, filterSignature: signature })],
      });
      const fetchImpl = mockFetchSequence(fakeResponse({ body: { userID: 1 } }), fakeResponse({ body: [] }));

      await syncLibrary(app);

      const url = new URL(fetchImpl.mock.calls[1][0].toString());
      expect(url.searchParams.get("since")).toBe("50");
    });

    test("no filter set behaves exactly like Phase 3/4 (plain items/top, no extra requests)", async () => {
      const app = createMockApp({ settings: { "Zotero API key": "k" } });
      const fetchImpl = mockFetchSequence(fakeResponse({ body: { userID: 1 } }), fakeResponse({ body: [] }));

      await syncLibrary(app);

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(fetchImpl.mock.calls[1][0].toString()).toContain("/users/1/items/top");
    });
  });
});
