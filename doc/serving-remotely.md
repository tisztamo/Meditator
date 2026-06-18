# Serving the Studio remotely

By default the [Studio](studio.md) is a localhost-only development tool: it binds
every interface, speaks plain HTTP/WS, and accepts any client with no
authentication. That is fine on your laptop. To run it on a server — so minds
live in a stable environment and you can tend them from a phone — two things have
to change: the **API must be protected**, and the **UI must be usable on a small
screen**.

This document is the design for that work. It is deliberately minimal: a
single-user tool gated by one shared password, reached over a
[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
so TLS and the public edge are handled for us.

> **Status (2026-06):** Phase A (protect the API) is **built**; Phase B (mobile
> polish) is still design. Phases are independent and can land in any order, but A
> before B is the natural sequence (secure the boundary, then polish the surface).

## The shape of the problem

Everything that controls a mind — `wake`, `sleep`, `force`, `input`, `focus` —
flows over **one WebSocket** (`src/studio/server.js`, the `wss` connection
handler). The HTTP side only serves static assets, images, and the entry page. So
the security boundary is really the WebSocket upgrade; the HTTP gate is secondary.

Browsers cannot set headers on `new WebSocket()`, but they **do** send same-origin
cookies on the WS handshake. That single fact decides the design: a signed
**httpOnly cookie** set by a login form gates both the HTTP routes and the WS
upgrade, with no token plumbing in the frontend.

---

## Phase A — Protect the API

### A1 · Shared-password session cookie

A login page issues a cookie that proves "I knew the password"; everything else
checks it.

- **New env:** `STUDIO_TOKEN` (the shared password) and `STUDIO_SESSION_SECRET`
  (HMAC signing key). The server refuses to start with a token set but no secret,
  so we never sign with a weak default.
- **Cookie:** value = `HMAC-SHA256(secret, "studio-v1")` — a constant, so no
  session store is needed. Flags `HttpOnly; Secure; SameSite=Lax; Max-Age=30d;
  Path=/`. `Secure` is correct because the page is served over HTTPS at the edge.
- **`requireAuth` middleware**, mounted *before* the static handlers. Parse the
  `Cookie` header (no new dependency), recompute the HMAC, compare with
  `crypto.timingSafeEqual`. Missing/invalid → redirect to `/login`.
- **`GET /login`** serves a tiny inline password form (allowed through the gate).
  **`POST /login`** verifies `STUDIO_TOKEN` with `timingSafeEqual`, sets the
  cookie, redirects to `/`. Optional `POST /logout`.
- **Brute-force guard:** in-memory failed-attempt counter per IP with a small
  fixed delay/lockout on `/login`. Sufficient for a single-user tool.

### A2 · Gate the WebSocket upgrade

The actual boundary. Without it the control channel stays wide open even after the
HTTP side is locked.

- Switch the server to validate the handshake — `WebSocketServer({ server,
  verifyClient })` (or `noServer` + `httpServer.on("upgrade")`). Read and verify
  the same cookie from the handshake request; reject with `401` otherwise.

### A3 · Bind to localhost

- `app.listen(STUDIO_PORT, "127.0.0.1", …)`. `cloudflared` connects locally, so
  the app must never listen on a public interface — the tunnel becomes the only
  way in.

### A4 · Frontend: WSS + auth-expiry

- Open the socket with the page's scheme:
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`
  (`src/studio/ui/studioConn.js`). Required — a plain `ws://` is blocked as mixed
  content behind HTTPS.
- When the socket keeps failing to connect (expired cookie), `location.reload()`
  so the HTTP gate redirects to `/login`, instead of looping the reconnect
  backoff forever.

### A5 · Deployment

- A `cloudflared` ingress snippet (→ `http://localhost:7600`) and a `systemd`
  unit (or documented launch command) that exports `STUDIO_TOKEN` /
  `STUDIO_SESSION_SECRET` and runs the Studio. These live in
  [`deploy/cloudflared-config.yml`](../deploy/cloudflared-config.yml) and
  [`deploy/meditator-studio.service`](../deploy/meditator-studio.service); each
  carries its own setup steps in a header comment.
- Optional defense-in-depth: Cloudflare Access in front of the hostname is a
  second gate, but the app cookie already satisfies the requirement.

> **Turning it on.** Auth is opt-in: with no `STUDIO_TOKEN` the Studio stays an
> open localhost dev tool. Set both secrets to gate it —
> `STUDIO_TOKEN=…  STUDIO_SESSION_SECRET=$(openssl rand -hex 32)  bun studio.js` —
> and the server refuses to start if a token is set without a secret.

### Out of scope (single-user, authed tool)

CORS (stays same-origin), per-mind authorization, request signing, and deep WS
input validation. Noted here so the omission is a decision, not an oversight.

---

## Phase B — Make the Studio usable on mobile

Three concrete complaints, three fixes. The desktop layout is untouched
throughout; all changes live under the existing `max-width:900px` breakpoint or in
persistence.

### B1 · A pane switcher instead of stacked columns

Today the breakpoint only *stacks* the three columns, so on a phone the roster and
wake picker sit in front of the content.

- Add a compact segmented control shown only on narrow screens —
  **Minds · Stream · Structure** — that reveals one column at a time. Default to
  **Stream** once a mind is focused, so the always-visible selector no longer
  blocks the view.

### B2 · Tree not fully open by default

`src/studio/ui/studioTree.js` force-opens `m-stream` / `m-speech` / `m-image`
nodes on every build.

- On narrow screens, open only the root. Persist each node's open/closed state
  (keyed by node path) so reopening a mind restores what you had expanded.

### B3 · Persist UI state across reloads

Only the stream mode and focused mind survive a reload today.

- Add a small `studioPrefs` helper (one namespaced `localStorage` object) and
  route the scattered keys through it. Persist: active mobile pane, tree node
  open-states, stream mode, and focused mind.

---

## Files touched

| Area | File |
|------|------|
| Auth, login routes, `verifyClient`, localhost bind | `src/studio/server.js` |
| WSS scheme + reload-on-expiry | `src/studio/ui/studioConn.js` |
| Mobile CSS + pane switcher | `src/studio/studio.html` |
| Tree open defaults + persistence | `src/studio/ui/studioTree.js` |
| Shared UI-state persistence | new `src/studio/ui/studioPrefs.js` |
| Deploy | `cloudflared` config + `systemd` unit + this doc |

No new runtime dependencies: Node `crypto` and manual cookie parsing on the
server, `express.urlencoded` (already bundled with Express) for the login form.
