// Shared leaf helpers for the Studio UI components — pure and framework-free.
// These are the small utilities the old monolithic studio.html kept as globals;
// the panes that need them now import them instead of duplicating them.

/** Escape a value for safe interpolation into innerHTML. */
export const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Build an element: tag, optional className, optional text. The stream's
 *  part-components render with plain DOM; this is the one-liner they share. */
export const mk = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};

/** Wall-clock HH:MM:SS, for event/log timestamps. */
export const clock = () => new Date().toTimeString().slice(0, 8);

/** Compact number: 1234 -> "1.2k", non-numbers -> em dash. */
export const fmt = n => (typeof n === "number" ? (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n)) : "—");

/** Is the scroll container within `pad` px of its bottom? Used to decide whether
 *  to keep a feed pinned to the latest as new content streams in. */
export const nearBottom = (el, pad = 120) => el.scrollHeight - el.scrollTop - el.clientHeight < pad;

/** Pin a scroll container to its bottom. */
export const scrollDown = el => { el.scrollTop = el.scrollHeight; };

/** Dispatch a Studio command as a bubbling "studio-command" DOM event. studio-conn
 *  adds one listener (in onConnect) that routes detail.cmd to its transport
 *  wrapper — the browser mirror of a faculty raising an `interrupt-request` for the
 *  arbiter. A pane states its intent and never reaches into the hub, so the command
 *  surface stays declared (greppable) and a second listener — a logger, a confirm
 *  gate — can interpose for free. `detail` is optional (e.g. a bare "refresh"). */
export const command = (el, cmd, detail) =>
  el.dispatchEvent(new CustomEvent("studio-command", { bubbles: true, detail: { cmd, ...detail } }));
