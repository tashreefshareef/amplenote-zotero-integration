export const ZOTERO_API_BASE = "https://api.zotero.org";
export const ZOTERO_API_VERSION = "3";

// The `setting | <label>` row this plugin reads via app.settings[label]. Keep this in
// sync with the plugin note's own metadata table — see docs/development.md.
export const SETTING_ZOTERO_API_KEY = "Zotero API key";

// Confirmed live against a real item (zotero-findings.md, 2026-09-05): include=citation,bib
// with this style returns both fields populated.
export const DEFAULT_CITATION_STYLE = "chicago-note-bibliography";

// Phase 3 sync bookkeeping (key -> noteUUID map, library version watermark) lives in a
// fenced code block under this heading, in a note with this name. api-notes.md #4: machine
// data belongs in a fence, never bare paragraph text. #4b: a heading is only as unique as
// its text, so sync-state.js counts occurrences before trusting a heading-addressed write.
export const SYNC_NOTE_NAME = "Zotero Sync";
export const SYNC_STATE_HEADING = "Zotero Sync State";
