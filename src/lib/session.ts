export const SESSION_START_KEY = "neocast.session.start";
export const SESSION_MINUTES = 30;

export function markSessionStart() {
  try { localStorage.setItem(SESSION_START_KEY, String(Date.now())); } catch { /* ignore */ }
}
export function clearSessionStart() {
  try { localStorage.removeItem(SESSION_START_KEY); } catch { /* ignore */ }
}
