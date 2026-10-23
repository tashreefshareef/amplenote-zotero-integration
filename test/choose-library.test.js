import { jest } from "@jest/globals";
import { chooseLibrary } from "../src/actions/choose-library.js";
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

const GROUPS = [
  { id: 30, data: { name: "Digital Humanities" } },
  { id: 99, data: { name: "Lab" } },
];

describe("chooseLibrary", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("offers My Library plus the key's groups, and saves the pick as readable text", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" }, promptQueue: ["30"] });
    const fetchImpl = mockFetchSequence(fakeResponse({ body: { userID: 1 } }), fakeResponse({ body: GROUPS }));

    await chooseLibrary(app);

    expect(fetchImpl.mock.calls[1][0].toString()).toContain("/users/1/groups");
    const options = app._calls.prompts[0].options.inputs[0].options;
    expect(options.map((o) => o.label)).toEqual(["My Library", "Group: Digital Humanities", "Group: Lab"]);
    expect(app.settings["Zotero library"]).toBe("Group 30: Digital Humanities");
    expect(app._calls.alerts.at(-1)).toBe('Now using group "Digital Humanities". The next Sync now is a full one.');
  });

  test("switching library clears a sync filter made for the old one, and says so", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k", "Zotero library": "Group 30: Digital Humanities", "Zotero sync filter": "Collections: Thesis" },
      promptQueue: ["user"],
    });
    mockFetchSequence(fakeResponse({ body: { userID: 1 } }), fakeResponse({ body: GROUPS }));

    await chooseLibrary(app);

    expect(app.settings["Zotero library"]).toBe("");
    expect(app.settings["Zotero sync filter"]).toBe("");
    expect(app._calls.alerts.at(-1)).toMatch(/Now using My Library.*sync filter was for the other library/);
  });

  test("picking the library already in use keeps the filter", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k", "Zotero library": "Group 30: Digital Humanities", "Zotero sync filter": "Collections: Thesis" },
      promptQueue: ["30"],
    });
    mockFetchSequence(fakeResponse({ body: { userID: 1 } }), fakeResponse({ body: GROUPS }));

    await chooseLibrary(app);

    expect(app.settings["Zotero sync filter"]).toBe("Collections: Thesis");
    expect(app._calls.alerts.at(-1)).toBe('Already using group "Digital Humanities".');
  });

  test("a key with no groups gets told how to grant one, not an empty list", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" } });
    mockFetchSequence(fakeResponse({ body: { userID: 1 } }), fakeResponse({ body: [] }));

    await chooseLibrary(app);

    expect(app._calls.prompts).toHaveLength(0);
    expect(app._calls.alerts[0]).toMatch(/can only see My Library/);
  });
});
