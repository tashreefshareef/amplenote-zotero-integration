export const ZOTERO_API_BASE = "https://api.zotero.org";
export const ZOTERO_API_VERSION = "3";

// The `setting | <label>` row this plugin reads via app.settings[label]. Keep this in
// sync with the plugin note's own metadata table — see docs/development.md.
export const SETTING_ZOTERO_API_KEY = "Zotero API key";

// Phase 5: which collections/tags to sync, as human-readable text (see sync-filter.js).
// Also declared as a `setting | <label>` row — app.setSetting writes here need the row
// to already exist, same as the API key.
export const SETTING_ZOTERO_SYNC_FILTER = "Zotero sync filter";

// Confirmed live against a real item (zotero-findings.md, 2026-09-05): include=citation,bib
// with this style returns both fields populated.
export const DEFAULT_CITATION_STYLE = "chicago-note-bibliography";

// Phase 3 sync bookkeeping (key -> noteUUID map, library version watermark) lives in a
// fenced code block under this heading, in a note with this name. api-notes.md #4: machine
// data belongs in a fence, never bare paragraph text. #4b: a heading is only as unique as
// its text, so sync-state.js counts occurrences before trusting a heading-addressed write.
export const SYNC_NOTE_NAME = "Zotero Sync";
export const SYNC_STATE_HEADING = "Zotero Sync State";

// Phase 4: the per-item-note section holding imported Zotero annotations (highlights,
// sticky notes). Present in every item note from creation so a later annotation-only
// refresh (sync-library.js) always has a section to target.
export const HIGHLIGHTS_HEADING = "Highlights & Notes";
