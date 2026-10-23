/**
 * Which Zotero library the plugin reads — the key owner's own ("My Library") or one of
 * their groups. Stored in the "Zotero library" setting as what a human would type
 * (api-notes.md #9c): blank for My Library, `Group 123456: Lab papers` for a group. Only
 * the number matters when reading it back, so a hand-typed `123456` works too.
 */
export function parseLibrarySetting(raw) {
  const match = (raw || "").match(/\d+/);
  return match ? { type: "group", id: Number(match[0]) } : { type: "user" };
}

export function renderLibrarySetting(group) {
  return group ? `Group ${group.id}: ${group.name}` : "";
}

/** The id sync-state.js records per note, so a library switch never mixes two up. */
export function libraryStateKey(library) {
  return library.type === "group" ? `group:${library.id}` : "user";
}

export function describeLibrary(library, groupName) {
  if (library.type !== "group") return "My Library";
  return groupName ? `group "${groupName}"` : `group ${library.id}`;
}
