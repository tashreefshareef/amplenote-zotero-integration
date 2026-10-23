import { ZoteroApiError, ZoteroRateLimitedError } from "../zotero-client.js";
import { describeLibrary } from "../library.js";
import { connect } from "../setup.js";

/**
 * Proves the API client works against the user's own key and library — the live-app
 * check every phase ends with (CLAUDE.md). With no key saved yet, `connect` asks for one
 * and checks it itself, so this reports that same answer instead of asking again.
 */
export async function testConnection(app) {
  const connection = await connect(app);
  if (!connection) return;
  const { client, library } = connection;

  try {
    const { userID, username, access } = connection.keyInfo || (await client.keysCurrent());
    const scope = access?.user
      ? Object.entries(access.user)
          .filter(([, granted]) => granted)
          .map(([name]) => name)
          .join(", ") || "none"
      : "unknown";
    let libraryLine = "";
    if (library.type === "group") {
      // The name comes from the key's own group list. A group missing from it can still
      // be readable — confirmed live 2026-10-23: public group 30 imported fine with a key
      // that isn't a member — so say what's known, not that access will fail.
      const groups = await client.listGroups();
      const group = groups.find((g) => g.id === library.id);
      libraryLine = group
        ? ` Library: ${describeLibrary(library, group.name)}.`
        : ` Library: group ${library.id}, which isn't one of your key's groups — it works only if the group is public.`;
    }
    await app.alert(`Connected as ${username} (userID ${userID}). Access: ${scope}.${libraryLine}`);
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
