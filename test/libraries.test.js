import { jest } from "@jest/globals";
import { createZoteroClient } from "../src/zotero-client.js";
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

function syncStateNote(state) {
  return {
    uuid: "sync-note-1",
    name: "Zotero Sync",
    content: `# Zotero Sync State\n\n\`\`\`json\n${JSON.stringify(state)}\n\`\`\`\n`,
  };
}

const KAHNEMAN = {
  key: "ABCD1234",
  version: 10,
  data: { title: "Thinking, Fast and Slow", tags: [] },
  citation: "<span>Kahneman.</span>",
  bib: "<div>Kahneman. 2011.</div>",
  links: {},
};

describe("createZoteroClient — groups", () => {
  test("a groupID scopes every library call to the group and skips /keys/current", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: [] })) // collections
      .mockResolvedValueOnce(fakeResponse({ body: [] })); // items/top
    const client = createZoteroClient({ apiKey: "k", groupID: 30, fetchImpl });

    await client.listCollections();
    await client.syncItems({});

    expect(fetchImpl.mock.calls[0][0].toString()).toContain("/groups/30/collections");
    expect(fetchImpl.mock.calls[1][0].toString()).toContain("/groups/30/items/top");
  });

  test("listGroups always reads the key owner's group list", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: [{ id: 30, data: { name: "DH" } }] }));
    const client = createZoteroClient({ apiKey: "k", groupID: 30, fetchImpl });

    expect(await client.listGroups()).toEqual([{ id: 30, name: "DH" }]);
    expect(fetchImpl.mock.calls[1][0].toString()).toContain("/users/1/groups");
  });
});

describe("createZoteroClient — publication fields", () => {
  test("carries DOI and the container title, whatever field this item type keeps it in", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(
        fakeResponse({
          body: [
            {
              key: "A",
              data: { itemType: "journalArticle", title: "A", DOI: "10.1/a", publicationTitle: "Nature", volume: "5", issue: "2", pages: "1-9", url: "https://x.org/a" },
            },
            { key: "B", data: { itemType: "bookSection", title: "B", bookTitle: "Handbook", publisher: "MIT Press", extra: "Some note\nDOI: 10.2/b" } },
          ],
        })
      );
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const { items } = await client.syncItems({});

    expect(items[0]).toMatchObject({
      doi: "10.1/a",
      publication: "Nature",
      volume: "5",
      issue: "2",
      pages: "1-9",
      sourceUrl: "https://x.org/a",
      itemType: "journalArticle",
    });
    expect(items[1]).toMatchObject({ doi: "10.2/b", publication: "Handbook", publisher: "MIT Press" });
  });
});

describe("syncLibrary — libraries", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("a switch of library makes the run a full one and records the new library", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k", "Zotero library": "Group 30: DH" },
      notes: [syncStateNote({ libraryVersion: 50, items: {} })],
    });
    const fetchImpl = mockFetchSequence(fakeResponse({ headers: { "Last-Modified-Version": "7" }, body: [] }));

    await syncLibrary(app);

    const url = new URL(fetchImpl.mock.calls[0][0].toString());
    expect(url.pathname).toBe("/groups/30/items/top");
    expect(url.searchParams.get("since")).toBeNull();
    const syncNote = app._notes.get("sync-note-1");
    expect(syncNote.content).toContain('"library": "group:30"');
    expect(syncNote.content).toContain('"libraryVersion": 7');
  });

  test("staying on the same library stays incremental", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k", "Zotero library": "Group 30: DH" },
      notes: [syncStateNote({ libraryVersion: 7, items: {}, library: "group:30" })],
    });
    const fetchImpl = mockFetchSequence(fakeResponse({ headers: { "Last-Modified-Version": "7" }, body: [] }));

    await syncLibrary(app);

    expect(new URL(fetchImpl.mock.calls[0][0].toString()).searchParams.get("since")).toBe("7");
  });

  test("the refresh pass skips notes from another library", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      notes: [
        syncStateNote({
          libraryVersion: 50,
          items: { GRP1: { noteUUID: "g-note", title: "Group item", library: "group:30" } },

        }),
        { uuid: "g-note", name: "Group item", content: "## Highlights & Notes\n\nkept\n" },
      ],
    });
    const fetchImpl = mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ headers: { "Last-Modified-Version": "50" }, body: [] })
    );

    await syncLibrary(app);

    expect(fetchImpl).toHaveBeenCalledTimes(2); // no children fetch for GRP1
    expect(app._notes.get("g-note").content).toContain("kept");
    expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 0 new, 0 updated, 0 highlights refreshed.");
  });

  test("a group item's highlight links open the group's PDF in Zotero desktop", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k", "Zotero library": "30" } });
    mockFetchSequence(
      fakeResponse({ headers: { "Last-Modified-Version": "7" }, body: [KAHNEMAN] }),
      fakeResponse({ body: [{ key: "ATT1", data: { itemType: "attachment", title: "K.pdf" }, links: {} }] }),
      fakeResponse({
        body: [
          {
            key: "ANN1",
            data: { itemType: "annotation", annotationType: "highlight", annotationText: "hi", annotationPosition: '{"pageIndex":3}', annotationSortIndex: "1" },
          },
        ],
      })
    );

    await syncLibrary(app);

    const created = app._calls.createdNotes.find((c) => c.name === "Thinking, Fast and Slow");
    expect(app._notes.get(created.uuid).content).toContain("zotero://open-pdf/groups/30/items/ATT1?page=4");
  });
});
