// Shared leaf helpers for the Studio UI components — pure and framework-free.
// These are the small utilities the old monolithic studio.html kept as globals;
// the panes that need them now import them instead of duplicating them.

/** Escape a value for safe interpolation into innerHTML. */
export const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Wall-clock HH:MM:SS, for event/log timestamps. */
export const clock = () => new Date().toTimeString().slice(0, 8);

/** Compact number: 1234 -> "1.2k", non-numbers -> em dash. */
export const fmt = n => (typeof n === "number" ? (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n)) : "—");

/** Is the scroll container within `pad` px of its bottom? Used to decide whether
 *  to keep a feed pinned to the latest as new content streams in. */
export const nearBottom = (el, pad = 120) => el.scrollHeight - el.scrollTop - el.clientHeight < pad;

/** Pin a scroll container to its bottom. */
export const scrollDown = el => { el.scrollTop = el.scrollHeight; };
