import { testConnection } from "./actions/test-connection.js";
import { insertCitationAtCursor, searchAndAppendCitation } from "./actions/citation-picker.js";
import { syncLibrary } from "./actions/sync-library.js";
import { configureSync } from "./actions/configure-sync.js";
// ⚠️ SPIKE — remove this import and the entry below once the local-server question is
// answered (src/actions/local-spike.js explains what it's testing).
import { localApiSpike } from "./actions/local-spike.js";

const plugin = {
  name: "Zotero Integration",

  appOption: {
    "Zotero: Test connection": testConnection,
    "Zotero: Search citation": searchAndAppendCitation,
    "Zotero: Sync now": syncLibrary,
    "Zotero: Configure sync": configureSync,
    "Zotero: Local API spike": localApiSpike, // ⚠️ SPIKE
  },

  insertText: {
    "Zotero: Insert citation": insertCitationAtCursor,
  },
};

export default plugin;
