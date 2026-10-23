import { jest } from "@jest/globals";
import { connect } from "../src/setup.js";
import { pickCitation } from "../src/actions/citation-picker.js";
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

describe("connect — first-run key prompt", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("uses the saved key without prompting", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "saved" } });

    const connection = await connect(app);

    expect(connection.apiKey).toBe("saved");
    expect(app._calls.prompts).toHaveLength(0);
  });

  test("checks a pasted key with Zotero, saves it, and says who it connected as", async () => {
    const app = createMockApp({ promptQueue: ["  new-key  "] });
    const fetchImpl = mockFetchSequence(fakeResponse({ body: { userID: 7, username: "tashreef" } }));

    const connection = await connect(app);

    expect(fetchImpl.mock.calls[0][1].headers["Zotero-API-Key"]).toBe("new-key");
    expect(app.setSetting).toHaveBeenCalledWith("Zotero API key", "new-key");
    expect(app._calls.alerts).toEqual(["Connected as tashreef. Your key is saved."]);
    expect(connection.keyInfo.userID).toBe(7);
  });

  test("a rejected key is not saved and the action stops", async () => {
    const app = createMockApp({ promptQueue: ["bad-key"] });
    mockFetchSequence(fakeResponse({ status: 403, body: "Forbidden" }));

    const connection = await connect(app);

    expect(connection).toBeNull();
    expect(app.setSetting).not.toHaveBeenCalled();
    expect(app._calls.alerts[0]).toMatch(/rejected the API key/);
  });

  test("a key that works but won't save still finishes this run, and says how to save it", async () => {
    const app = createMockApp({ promptQueue: ["new-key"] });
    app.setSetting.mockRejectedValueOnce(new Error("no such setting"));
    mockFetchSequence(fakeResponse({ body: { userID: 7, username: "tashreef" } }));

    const connection = await connect(app);

    expect(connection.apiKey).toBe("new-key");
    expect(app._calls.alerts[0]).toMatch(/couldn't be saved \(no such setting\)/);
  });

  test("the action the user started carries on after setup, reusing the checked userID", async () => {
    const app = createMockApp({ promptQueue: ["new-key", "kahneman", "ABCD1234", "pandoc"] });
    const fetchImpl = mockFetchSequence(
      fakeResponse({ body: { userID: 7, username: "tashreef" } }), // the key check
      fakeResponse({ body: [{ key: "ABCD1234", data: { title: "Thinking", creators: [{ lastName: "Kahneman" }], date: "2011" } }] })
    );

    const result = await pickCitation(app);

    expect(result.text).toBe("[@kahneman2011]");
    // No second /keys/current: the userID from the setup check is reused.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0].toString()).toContain("/users/7/items/top");
  });

  test("points the client at the group the library setting names", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k", "Zotero library": "Group 30: Digital Humanities" } });
    const fetchImpl = mockFetchSequence(fakeResponse({ body: [] }));

    const { client, library } = await connect(app);
    await client.searchItems({ query: "x" });

    expect(library).toEqual({ type: "group", id: 30 });
    // A group path needs no userID, so no /keys/current first.
    expect(fetchImpl.mock.calls[0][0].toString()).toContain("/groups/30/items/top");
  });
});
