/**
 * Citation output formats — the Obsidian reference plugin's `Format` set
 * (formatted-citation, formatted-bibliography, pandoc, latex, biblatex), minus its
 * free-form `template`. `formatted` and `bibliography` come straight from Zotero's
 * server-side CSL rendering (`include=citation,bib`); the other three need a cite key.
 */
export const CITATION_FORMATS = ["formatted", "bibliography", "pandoc", "latex", "biblatex"];

export function normalizeFormat(raw) {
  const f = (raw || "").trim().toLowerCase();
  return CITATION_FORMATS.includes(f) ? f : "formatted";
}

function slug(s) {
  return (s || "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/**
 * The reference plugin gets cite keys from Better BibTeX, which doesn't exist here.
 * Zotero 7 has a native "Citation Key" field (`data.citationKey`) — used whenever it's
 * set. When it's blank (it usually is unless the user fills it in), fall back to the
 * most common cite-key shape, `<first author's last name><year>` (kahneman2011), then
 * `<first title word><year>`, then the item's Zotero key so it's never empty. A user
 * who wants BibTeX-exact keys sets Zotero's Citation Key field and this steps aside.
 */
export function deriveCiteKey(item) {
  if (item.citationKey) return item.citationKey;
  const author = (item.creators || []).find((c) => c.lastName || c.name);
  const namePart = slug(author ? author.lastName || author.name : (item.title || "").split(/\s+/)[0]);
  const year = ((item.date || "").match(/\d{4}/) || [""])[0];
  return `${namePart}${year}` || item.key;
}

export function formatCitation(item, format) {
  switch (normalizeFormat(format)) {
    case "bibliography":
      return item.bib || item.citation;
    case "pandoc":
      return `[@${deriveCiteKey(item)}]`;
    case "latex":
      return `\\cite{${deriveCiteKey(item)}}`;
    case "biblatex":
      return `\\autocite{${deriveCiteKey(item)}}`;
    default:
      return item.citation;
  }
}
