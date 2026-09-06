import { testConnection } from "./actions/test-connection.js";
import { insertCitationAtCursor, searchAndAppendCitation } from "./actions/citation-picker.js";
import { syncLibrary } from "./actions/sync-library.js";

const plugin = {
  name: "Zotero Integration",

  appOption: {
    "Zotero: Test connection": testConnection,
    "Zotero: Search citation": searchAndAppendCitation,
    "Zotero: Sync now": syncLibrary,
  },

  insertText: {
    "Zotero: Insert citation": insertCitationAtCursor,
  },
};

export default plugin;
