export const ZOTERO_API_BASE = "https://api.zotero.org";
export const ZOTERO_API_VERSION = "3";

// The `setting | <label>` row this plugin reads via app.settings[label]. Keep this in
// sync with the plugin note's own metadata table — see docs/development.md.
export const SETTING_ZOTERO_API_KEY = "Zotero API key";

// Confirmed live against a real item (zotero-findings.md, 2026-09-05): include=citation,bib
// with this style returns both fields populated.
export const DEFAULT_CITATION_STYLE = "chicago-note-bibliography";
