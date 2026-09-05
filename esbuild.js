/**
 * Build: src/  ->  dist/plugin.js
 *
 * An Amplenote plugin is a single self-contained JS expression pasted into one code
 * block in a note — no imports, no npm at runtime. Editing that as one hand-maintained
 * file doesn't scale, so this repo authors normal ES modules in src/ and bundles them
 * down to the single expression Amplenote wants.
 *
 * Adapted from reference/pdf-annotator/esbuild.js. Dropped for now: the stylesheet and
 * embed-markup-comment minifier plugins — nothing in src/ has an embed yet
 * (zotero-findings.md: the citation picker runs through app.prompt, no embed needed).
 * Re-add them from the reference file if/when one shows up.
 */
import * as esbuild from "esbuild";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const OUT_DIR = "dist";
const SYNC_FILE = `${OUT_DIR}/plugin.js`;
const PASTE_FILE = `${OUT_DIR}/plugin-paste.js`;

const result = await esbuild.build({
  entryPoints: ["src/plugin.js"],
  bundle: true,
  format: "iife",
  globalName: "__pluginModule",
  platform: "browser",
  target: "es2020",
  minify: true,
  // Escape non-ASCII in string literals — the output travels through clipboards and
  // note storage of uncertain encoding. A stray em-dash arrived as mojibake once
  // (reference/pdf-annotator's own build comment), from a raw clipboard paste rather
  // than this escape — belt and braces.
  charset: "ascii",
  write: false,
});

const bundled = result.outputFiles[0].text;
const version = JSON.parse(readFileSync("package.json", "utf8")).version;

/**
 * Two artifacts from one bundle. dist/plugin.js is the Plugin Builder sync target, whose
 * format contract is strict and undocumented (reference/pdf-annotator/development.md):
 *   - the FIRST line must contain "(() => {"
 *   - the content must END with "})();"
 *   - a top-level `var plugin` must exist
 * dist/plugin-paste.js is the same code with `return plugin;` already applied, for
 * pasting into the code block by hand when sync isn't set up.
 */
const body = `(() => {
  // Amplenote Zotero Integration - v${version}
  // GENERATED FILE - do not edit. Edit src/ and run \`npm run build\`.
${bundled}
  var plugin = __pluginModule.default;`;

const syncOutput = `${body}\n})();\n`;
const pasteOutput = `${body}\n  return plugin;\n})()\n`;

const nonAscii = [...pasteOutput].filter((ch) => ch.charCodeAt(0) > 127);
if (nonAscii.length) {
  const unique = [...new Set(nonAscii)].join(" ");
  console.error(`Build failed: ${nonAscii.length} non-ASCII character(s) in output: ${unique}`);
  console.error("Replace them with ASCII equivalents (- for dashes, ... for ellipses).");
  process.exit(1);
}

// Assert the Plugin Builder contract at build time. A violation here is invisible until
// a sync silently produces a corrupted code block in the live plugin note.
const trimmed = syncOutput.trim();
const problems = [];
if (!trimmed.split("\n")[0].includes("(() => {")) problems.push("first line must contain '(() => {'");
if (!/\}\)\(\);$/.test(trimmed)) problems.push("output must end with '})();'");
if (!/^\s*var plugin =/m.test(syncOutput)) problems.push("a top-level `var plugin =` must exist");
if (problems.length) {
  console.error("Build failed: dist/plugin.js breaks the Plugin Builder contract:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

// Not a limit on what a note can hold — a note takes far more (docs/api-notes.md #2).
// This is the cap on replaceContent, which is how Plugin Builder syncs, so it's the
// ceiling on this project's deployment path.
const MAX_NOTE_CHARS = 100_000;
if (pasteOutput.length > MAX_NOTE_CHARS) {
  console.error(`Build failed: output is ${pasteOutput.length} chars, over Amplenote's ${MAX_NOTE_CHARS} limit.`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(SYNC_FILE, syncOutput, "utf8");
writeFileSync(PASTE_FILE, pasteOutput, "utf8");

const kb = (Buffer.byteLength(pasteOutput, "utf8") / 1024).toFixed(1);
const headroom = Math.round((1 - pasteOutput.length / MAX_NOTE_CHARS) * 100);
console.log(`Built ${SYNC_FILE} + ${PASTE_FILE} (${kb} kB, ${headroom}% under the note limit)`);
