/**
 * Zotero's `citation`/`bib` fields come back as HTML (a `<span>` and a
 * `<div class="csl-bib-body">`, confirmed live — zotero-findings.md). `insertText` is a
 * plain-text macro (docs/api-notes.md #11): an unstripped tag arrives in the note as
 * literal angle brackets, not formatting. `insertNoteContent` writes markdown, not HTML,
 * so the appOption path needs plain text too. Strip once here rather than at each caller.
 */
export function stripHtmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Amplenote's own `select` prompt input doesn't wrap or truncate a long option label —
 * a full citation overflows the box and needs a scrollbar to read, reported live against
 * a real search result. Truncate what's shown in the picker; the untruncated citation is
 * still what actually gets inserted (this only touches the option label).
 */
export function truncateForLabel(text, maxLength = 80) {
  if (!text || text.length <= maxLength) return text || "";
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}
