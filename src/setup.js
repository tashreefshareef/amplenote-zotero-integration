import { SETTING_ZOTERO_API_KEY, SETTING_ZOTERO_LIBRARY } from "./constants.js";
import { createZoteroClient, describeZoteroError } from "./zotero-client.js";
import { parseLibrarySetting } from "./library.js";

function firstValue(promptResult) {
  return Array.isArray(promptResult) ? promptResult[0] : promptResult;
}

/**
 * First run: no key saved yet. Rather than alerting "go fill in the settings page" and
 * stopping, ask for the key right here, check it against Zotero, and save it with
 * app.setSetting (api-notes.md #9c: works for a declared `setting` row, which this one
 * always is). The action the user started then carries on.
 *
 * `secureText` is one of app.prompt's input types (api-notes.md #9c) — it hides the key
 * as it's pasted. Returns `{ apiKey, keyInfo }`, or null if cancelled or rejected.
 */
export async function promptForApiKey(app) {
  const result = await app.prompt(
    "Connect Zotero. Create a key at zotero.org/settings/keys (Create new private key): tick Allow library access and Allow notes access, leave write access off. Paste it here.",
    { inputs: [{ label: "Zotero API key", type: "secureText" }] }
  );
  if (result === null) return null;
  const apiKey = (firstValue(result) || "").trim();
  if (!apiKey) return null;

  let keyInfo;
  try {
    keyInfo = await createZoteroClient({ apiKey }).keysCurrent();
  } catch (e) {
    await app.alert(describeZoteroError(e));
    return null;
  }

  try {
    await app.setSetting(SETTING_ZOTERO_API_KEY, apiKey);
  } catch (e) {
    // The key works, so finish this run with it; only remembering it failed.
    await app.alert(
      `Connected as ${keyInfo.username}, but the key couldn't be saved (${e.message}). Paste it into the "${SETTING_ZOTERO_API_KEY}" setting so you aren't asked again.`
    );
    return { apiKey, keyInfo };
  }
  await app.alert(`Connected as ${keyInfo.username}. Your key is saved.`);
  return { apiKey, keyInfo };
}

/**
 * Every action's way in: the saved key (or the first-run prompt above), the selected
 * library, and a client pointed at it. Returns null when the user cancelled or the key
 * was rejected — the reason has already been shown. `keyInfo` is set only when the key
 * was just checked, so Test connection doesn't ask Zotero the same thing twice.
 */
export async function connect(app) {
  let apiKey = (app.settings[SETTING_ZOTERO_API_KEY] || "").trim();
  let keyInfo = null;
  if (!apiKey) {
    const entered = await promptForApiKey(app);
    if (!entered) return null;
    ({ apiKey, keyInfo } = entered);
  }

  const library = parseLibrarySetting(app.settings[SETTING_ZOTERO_LIBRARY]);
  const client = createZoteroClient({
    apiKey,
    userID: keyInfo?.userID,
    groupID: library.type === "group" ? library.id : undefined,
  });
  return { apiKey, keyInfo, library, client };
}
