import { jest } from "@jest/globals";
import { testConnection } from "../src/actions/test-connection.js";
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

describe("testConnection", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("asks for the key when none is configured, and stops quietly if that's cancelled", async () => {
    const app = createMockApp();
    const fetchImpl = jest.spyOn(globalThis, "fetch");

    await testConnection(app);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(app._calls.prompts[0].options.inputs[0]).toMatchObject({ label: "Zotero API key", type: "secureText" });
    expect(app._calls.alerts).toEqual([]);
  });

  test("alerts a success message with userID and access scope on a valid key", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "good-key" } });
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      fakeResponse({
        body: {
          userID: 16332327,
          username: "tashreef",
          access: { user: { library: true, files: true, notes: true } },
        },
      })
    );

    await testConnection(app);

    expect(app._calls.alerts[0]).toContain("tashreef");
    expect(app._calls.alerts[0]).toContain("16332327");
    expect(app._calls.alerts[0]).toContain("library");
  });

  test("alerts a clear message when the key is rejected", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "bad-key" } });
    jest.spyOn(globalThis, "fetch").mockResolvedValue(fakeResponse({ status: 403 }));

    await testConnection(app);

    expect(app._calls.alerts[0]).toMatch(/rejected/i);
  });

  test("alerts a rate-limit message with the wait time, not a raw error", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "good-key" } });
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeResponse({ status: 429, headers: { "Retry-After": "15" } }));

    await testConnection(app);

    expect(app._calls.alerts[0]).toMatch(/15s/);
  });

  describe("with a group library selected", () => {
    const KEY = { userID: 1, username: "tashreef", access: { user: { library: true } } };

    function mockFetch(...bodies) {
      const fetchImpl = jest.fn();
      for (const body of bodies) fetchImpl.mockResolvedValueOnce(fakeResponse({ body }));
      jest.spyOn(globalThis, "fetch").mockImplementation(fetchImpl);
    }

    test("names a group the key belongs to", async () => {
      const app = createMockApp({ settings: { "Zotero API key": "k", "Zotero library": "Group 30: DH" } });
      mockFetch(KEY, [{ id: 30, data: { name: "Digital Humanities" } }]);

      await testConnection(app);

      expect(app._calls.alerts[0]).toMatch(/Library: group "Digital Humanities"\.$/);
    });

    test("a group outside the key's list is flagged as public-only, not as unreadable", async () => {
      const app = createMockApp({ settings: { "Zotero API key": "k", "Zotero library": "30" } });
      mockFetch(KEY, []);

      await testConnection(app);

      expect(app._calls.alerts[0]).toMatch(/group 30, which isn't one of your key's groups — it works only if the group is public\./);
    });
  });
});
