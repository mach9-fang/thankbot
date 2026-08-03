import emoji from "emoji-toolkit";

/**
 * Turn Slack-style `:construction_worker:` shortcodes into Unicode emoji so
 * the board and thank cards render them instead of the raw colon names.
 * Unknown/custom Slack emoji names are left unchanged.
 */
export function emojifyText(text: string): string {
  if (!text.includes(":")) return text;
  return emoji.shortnameToUnicode(text);
}
