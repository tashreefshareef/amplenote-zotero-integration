/**
 * Jest runs against the ESM sources in src/ directly — no build step, no transform.
 * That works because src/ is plain modern JS and package.json sets "type": "module";
 * the `--experimental-vm-modules` flag in the `test` script is what enables it.
 *
 * "node" environment: nothing in src/ touches the DOM yet (Phase 2's citation picker
 * runs through app.prompt, not an embed — zotero-findings.md). Switch to jsdom if a
 * later phase adds embed-side code, matching the PDF Annotator's config.
 */
export default {
  testEnvironment: "node",
  testMatch: ["**/test/**/*.test.js"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  collectCoverageFrom: ["src/**/*.js"],
  verbose: true,
};
