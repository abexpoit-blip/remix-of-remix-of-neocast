/** Normalise an admin-entered Telegram handle or URL into a t.me link. */
export const telegramUrl = (value: string): string => {
  const v = value.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://t.me/${v.replace(/^@/, "")}`;
};

/** Display label for a handle or URL (always @handle form). */
export const telegramLabel = (value: string): string => {
  const v = value.trim();
  if (!v) return "";
  const handle = v.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "").replace(/^@/, "").replace(/\/$/, "");
  return `@${handle}`;
};
