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

// Parity pass C (docs/development.md). Both optional `setting | <label>` rows:
//  - citation style: any CSL style id Zotero's `style=` param accepts (apa, ieee,
//    chicago-note-bibliography, ...). Blank = DEFAULT_CITATION_STYLE.
//  - citation format: the DEFAULT offered by the citation picker; see cite-key.js's
//    CITATION_FORMATS for the accepted values. Blank = "formatted".
export const SETTING_ZOTERO_CITATION_STYLE = "Zotero citation style";
export const SETTING_ZOTERO_CITATION_FORMAT = "Zotero citation format";

// Phase 3 sync bookkeeping (key -> noteUUID map, library version watermark) lives in a
// fenced code block under this heading, in a note with this name. api-notes.md #4: machine
// data belongs in a fence, never bare paragraph text. #4b: a heading is only as unique as
// its text, so sync-state.js counts occurrences before trusting a heading-addressed write.
export const SYNC_NOTE_NAME = "Zotero Sync";
export const SYNC_STATE_HEADING = "Zotero Sync State";

// The four sections of every synced item note, in order. Every write after creation is
// section-scoped (note-sections.js) so a re-sync never touches anything the user added —
// the Obsidian reference plugin's `{% persist %}` equivalent. Sync rewrites the first
// three; MY_NOTES is created once and never written again.
export const REFERENCE_HEADING = "Reference";
export const ZOTERO_NOTES_HEADING = "Zotero Notes";
export const HIGHLIGHTS_HEADING = "Highlights & Notes";
export const MY_NOTES_HEADING = "My Notes";
