import { testConnection } from "./actions/test-connection.js";
import { insertCitationAtCursor, searchAndAppendCitation } from "./actions/citation-picker.js";
import { syncLibrary } from "./actions/sync-library.js";
import { configureSync } from "./actions/configure-sync.js";
import { importItem } from "./actions/import-item.js";
import { chooseLibrary } from "./actions/choose-library.js";

const plugin = {
  name: "Zotero Integration",

  appOption: {
    "Zotero: Test connection": testConnection,
    "Zotero: Search citation": searchAndAppendCitation,
    "Zotero: Sync now": syncLibrary,
    "Zotero: Import item": importItem,
    "Zotero: Configure sync": configureSync,
    "Zotero: Choose library": chooseLibrary,
  },

  insertText: {
    "Zotero: Insert citation": insertCitationAtCursor,
  },
};

export default plugin;
