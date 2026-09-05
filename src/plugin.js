import { testConnection } from "./actions/test-connection.js";
import { insertCitationAtCursor, searchAndAppendCitation } from "./actions/citation-picker.js";

const plugin = {
  name: "Zotero Integration",

  appOption: {
    "Zotero: Test connection": testConnection,
    "Zotero: Search citation": searchAndAppendCitation,
  },

  insertText: {
    "Zotero: Insert citation": insertCitationAtCursor,
  },
};

export default plugin;
