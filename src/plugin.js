import { testConnection } from "./actions/test-connection.js";
import { insertCitationAtCursor, searchAndAppendCitation } from "./actions/citation-picker.js";
import { syncLibrary } from "./actions/sync-library.js";
import { configureSync } from "./actions/configure-sync.js";
// ⚠️ SPIKE — remove these three lines and the entries below once the PDF viewer
// question is answered (src/actions/pdf-spike.js explains what it's testing).
import { insertPdfSpike, renderPdfSpike, spikeEmbedCall } from "./actions/pdf-spike.js";

const plugin = {
  name: "Zotero Integration",

  appOption: {
    "Zotero: Test connection": testConnection,
    "Zotero: Search citation": searchAndAppendCitation,
    "Zotero: Sync now": syncLibrary,
    "Zotero: Configure sync": configureSync,
    "Zotero: PDF viewer spike": insertPdfSpike, // ⚠️ SPIKE
  },

  insertText: {
    "Zotero: Insert citation": insertCitationAtCursor,
  },

  // ⚠️ SPIKE — this plugin has no other embed; both go when the spike does.
  renderEmbed: renderPdfSpike,
  onEmbedCall: spikeEmbedCall,
};

export default plugin;
