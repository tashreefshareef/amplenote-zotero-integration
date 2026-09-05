import { SETTING_ZOTERO_API_KEY } from "../constants.js";
import { createZoteroClient, ZoteroApiError, ZoteroRateLimitedError } from "../zotero-client.js";

/**
 * Proves the API client works against the user's own key and library — the live-app
 * check every phase ends with (CLAUDE.md). Not a feature; there is nothing else in
 * Phase 1 for a user to run.
 */
export async function testConnection(app) {
  const apiKey = (app.settings[SETTING_ZOTERO_API_KEY] || "").trim();
  if (!apiKey) {
    await app.alert(`Set the "${SETTING_ZOTERO_API_KEY}" row in this plugin note's metadata table first.`);
    return;
  }

  const client = createZoteroClient({ apiKey });
  try {
    const { userID, username, access } = await client.keysCurrent();
    const scope = access?.user
      ? Object.entries(access.user)
          .filter(([, granted]) => granted)
          .map(([name]) => name)
          .join(", ") || "none"
      : "unknown";
    await app.alert(`Connected as ${username} (userID ${userID}). Access: ${scope}.`);
  } catch (e) {
    if (e instanceof ZoteroRateLimitedError) {
      await app.alert(`Zotero rate-limited this request — retry in ${e.retryAfterSeconds}s.`);
    } else if (e instanceof ZoteroApiError) {
      await app.alert(`Zotero API key rejected (HTTP ${e.status}). Check the key is current.`);
    } else {
      await app.alert(`Could not reach Zotero: ${e.message}`);
    }
  }
}
