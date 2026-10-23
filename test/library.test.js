import { parseLibrarySetting, renderLibrarySetting, libraryStateKey, describeLibrary } from "../src/library.js";

describe("library setting", () => {
  test("blank, or any text without a number, is My Library", () => {
    expect(parseLibrarySetting("")).toEqual({ type: "user" });
    expect(parseLibrarySetting(undefined)).toEqual({ type: "user" });
    expect(parseLibrarySetting("My Library")).toEqual({ type: "user" });
  });

  test("reads back what Choose library writes, and a bare hand-typed id", () => {
    const written = renderLibrarySetting({ id: 123456, name: "Lab papers" });
    expect(written).toBe("Group 123456: Lab papers");
    expect(parseLibrarySetting(written)).toEqual({ type: "group", id: 123456 });
    expect(parseLibrarySetting(" 30 ")).toEqual({ type: "group", id: 30 });
  });

  test("a group named with digits still reads as its id, which comes first", () => {
    expect(parseLibrarySetting(renderLibrarySetting({ id: 42, name: "Class of 2026" }))).toEqual({ type: "group", id: 42 });
  });

  test("My Library writes as blank", () => {
    expect(renderLibrarySetting(null)).toBe("");
  });

  test("state keys and names", () => {
    expect(libraryStateKey({ type: "user" })).toBe("user");
    expect(libraryStateKey({ type: "group", id: 30 })).toBe("group:30");
    expect(describeLibrary({ type: "user" })).toBe("My Library");
    expect(describeLibrary({ type: "group", id: 30 }, "DH")).toBe('group "DH"');
    expect(describeLibrary({ type: "group", id: 30 })).toBe("group 30");
  });
});
