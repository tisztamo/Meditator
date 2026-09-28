import { MBaseComponent } from "./mBaseComponent.js";
import { TELEMETRY_EVENT, TELEMETRY_WANTED } from "./telemetry.js";
import { closestRole, part } from "./enclosure.js";
import { stimulus, renderStimulus } from "../../infrastructure/interruptRecord.js";
import { langOf } from "./i18n.js";
import { logger } from "../../infrastructure/logger.js";

const log = logger("mWs.js");

/**
 * WebSocket server component: the live window onto a running mind. It does two
 * things for every connected client:
 *
 *   1. Transport (unchanged, backward-compatible): broadcasts the thinking
 *      stream as "thought_fragment" messages and stream state as "status".
 *   2. Instrumentation: on connect it sends the mind's component STRUCTURE, and
 *      then forwards the mind's internal signals as structured "event" messages
 *      (the assembled attention frame, every observer's salience-scored bid and
 *      the arbiter's verdict, burst boundaries, memory consolidation, energy/
 *      pace, and — when present — the speaking voice). This is what lets the
 *      bundled dashboard show the structure of the mind and open each process up
 *      for inspection.
 *
 * The transport looks up no faculty: each one that wants to be seen fires
 * `telemetry {process, kind, data}` (shared/telemetry.js) and m-ws forwards
 * what it hears under its membrane, so a minimal mind simply emits fewer events
 * and a substitute faculty is seen as long as it reports. Multiple clients may connect at once; a
 * freshly connected client is sent the structure plus the latest snapshot of
 * every signal, so it has the whole picture immediately.
 *
 * @interface
 * Attributes:
 *   - port: Port to listen on for WebSocket connections (defaults to 7627)
 *   - src / stateSrc: override which topics feed thought_fragment / status
 *   - speechSrc: the voice's fragments for speech_fragment (default
 *     "!scope/voice/speech"; "off" for none)
 *
 * Subscriptions (transport): "!scope/stream/chunk", "!scope/stream/state", speechSrc
 * Subscriptions (instrument): "!scope/prompt", "!scope/pace",
 *   "!scope/@interrupt-request", "!scope/@interrupt", "!scope/@telemetry"
 *   (a society's public socket also hears each member's "!cluster/<member>/…")
 *
 * Topics published to: "interrupt-request" (when client input is received)
 * Events fired: "telemetry-wanted" once it listens (faculties re-announce state)
 */
export class MWs extends MBaseComponent {
  // The camera does not gravitate: m-ws taps everything, and letting it join the
  // space would bend the layout toward the observer (plenum.md §3.5).
  static spaceParticipates = false;

  server = null;
  clients = new Set();
  clientBuffers = new Map();
  _snapshot = new Map();      // "process/kind" -> last message, replayed to new clients
  _structureCache = null;
  _layoutTimer = null;        // the Plenum camera's ~1 Hz ticker, alive only while clients watch

  /**
   * Set up the WebSocket server when the component connects
   */
  async onConnect() {
    // The mind's retained `identity` (its companion's name), mirrored, not asked for.
    this.sub("!scope/identity", id => { this._mindIdentity = id || null }).catch(() => {});
    try {
      // Dynamic import of WebSocket module
      const { WebSocketServer } = await import("ws");

      // Get port from the environment (the Studio supervisor places each child
      // on a distinct port via MEDITATOR_WS_PORT), else the attribute, else the
      // public default 7627. A mind run directly with no env is unchanged.
      const port = parseInt(this._listenPort(), 10);

      // Initialize WebSocket server
      this.server = new WebSocketServer({ port });
      log.debug(`WebSocket server started on port ${port}`);

      // Set up server event handlers
      this.server.on("connection", this.handleConnection.bind(this));
      this.server.on("error", (error) => {
        log.error("WebSocket server error:", error);
      });

      // Wait until the mind's components have upgraded before wiring taps.
      // Component upgrade order is not guaranteed, and m-ws (which awaits a
      // dynamic import) can otherwise run its onConnect before m-stream/m-mind
      // exist as Amanita components, so the refs would resolve against
      // un-upgraded elements and the short retry window would expire.
      await this._whenReady();

      // Dual-use (agent-loop.md §10): under an <m-agent> there is no thought-stream to
      // transport and no mind to instrument. The socket becomes a TASK PORT — inbound
      // client input is fired as a `task` event (handleInputAndCreateInterrupt) that
      // bubbles to the agent — and we broadcast the agent's status so a client can watch
      // it work. The mind path below is untouched.
      if (this._forAgent()) {
        this._instrumentAgent();
        log.debug("WebSocket component initialized as an agent task port");
        return;
      }

      // Subscribe to stream chunks and state changes. Mind-relative refs (!scope/…)
      // so this binds to ITS OWN mind's stream even when several minds run together in
      // one document (a society); for a lone mind it resolves to the very same element
      // the old absolute "/stream/chunk" did. These power the classic, backward-
      // compatible thought_fragment / status messages.
      this.sub(this.attr("src") || "!scope/stream/chunk", this.onChunk);
      this.sub(this.attr("stateSrc") || "!scope/stream/state", this.onState);

      // Subscribe to the rest of the mind's signals for the dashboard.
      this._instrument();

      log.debug("WebSocket component initialized");
    } catch (error) {
      log.error("Failed to initialize WebSocket server:", error);
    }
  }

  /**
   * Clean up resources when component disconnects
   */
  onDisconnect() {
    this._syncLayoutTicker();
    if (this.server) {
      // Close all client connections
      for (const client of this.clients) {
        if (client.readyState === client.OPEN) {
          client.close();
        }
      }

      // Close the server
      this.server.close(() => {
        log.debug("WebSocket server closed");
      });

      this.server = null;
      this.clients.clear();
      this.clientBuffers.clear();
    }
  }

  /**
   * Handle new WebSocket client connection
   * @param {WebSocket} client - The connected client
   * @param {Request} request - The HTTP request that initiated the connection
   */
  handleConnection(client, request) {
    const clientId = this.generateClientId();
    log.debug(`New WebSocket client connected: ${clientId}`);

    // Add to client set
    this.clients.add(client);

    // Initialize buffer for this client
    this.clientBuffers.set(client, {
      inputBuffer: "",
      clientId
    });

    // Send welcome message
    this.sendToClient(client, {
      type: "status",
      data: {
        status: "connected",
        message: "Connected to Meditator stream",
        clientId
      }
    });

    // Send the mind's structure and the latest snapshot of every signal, so a
    // freshly connected client has the whole picture immediately.
    const structure = this._structure();
    if (structure) this.sendToClient(client, { type: "structure", data: { tree: structure } });
    for (const msg of this._snapshot.values()) this.sendToClient(client, msg);

    // The Plenum's camera view: one layout snapshot now, then the low-cadence
    // ticker while anyone is watching (plenum.md §5 — runtime never reads this).
    const layout = this._layout();
    if (layout.length) this.sendToClient(client, { type: "layout", data: { positions: layout } });
    this._syncLayoutTicker();

    // Set up client event handlers
    client.on("message", (data) => this.handleClientMessage(client, data));

    client.on("close", () => {
      log.debug(`WebSocket client disconnected: ${clientId}`);
      this.clients.delete(client);
      this.clientBuffers.delete(client);
      this._syncLayoutTicker();
    });

    client.on("error", (error) => {
      log.error(`WebSocket client error (${clientId}):`, error);
    });
  }

  /**
   * Handle message from a client
   * @param {WebSocket} client - The client that sent the message
   * @param {Buffer|string} data - The message data
   */
  handleClientMessage(client, data) {
    try {
      const message = data.toString();
      const clientInfo = this.clientBuffers.get(client);

      // Try to parse as JSON first
      try {
        const jsonMessage = JSON.parse(message);

        // Handle structured input types
        if (jsonMessage.type === "input" && jsonMessage.data && jsonMessage.data.message) {
          // Create an interrupt with the message content
          this.handleInputAndCreateInterrupt(client, jsonMessage.data.message);
          return;
        }

        // Lifecycle control (e.g. the Studio supervisor asking the mind to sleep).
        // Gated by MEDITATOR_WS_CONTROL so a directly-run or public-facing mind on
        // 7627 never lets an arbitrary client end it; the supervisor sets the flag
        // on the children it spawns.
        if (jsonMessage.type === "control" && jsonMessage.action) {
          this.handleControlMessage(jsonMessage.action);
          return;
        }
      } catch (e) {
        // Not JSON, treat as plain text
      }

      // Handle plain text by buffering until newline
      clientInfo.inputBuffer += message;

      // Check if the buffer contains a newline (Enter key)
      if (clientInfo.inputBuffer.includes("\n")) {
        const lines = clientInfo.inputBuffer.split("\n");
        const completedInput = lines.shift().trim();

        // Keep any remaining text after the newline for next time
        clientInfo.inputBuffer = lines.join("\n");

        if (completedInput) {
          this.handleInputAndCreateInterrupt(client, completedInput);
        }
      }
    } catch (error) {
      log.error("Error handling client message:", error);
    }
  }

  /**
   * Handle input and create an interrupt request
   * @param {WebSocket} client - The client that sent the input
   * @param {string} input - The input text
   */
  handleInputAndCreateInterrupt(client, input) {
    const clientInfo = this.clientBuffers.get(client);
    log.debug(`Received input from client ${clientInfo.clientId}: ${input}`);

    // Send acknowledgment back to the client
    this.sendToClient(client, {
      type: "status",
      data: {
        status: "input_received",
        message: "Input received"
      }
    });

    // Under an <m-agent> the input is a TASK, not a stimulus for a mind's attention: fire
    // a bubbling `task` event the agent folds into a `user` turn (agent-loop.md §10). No
    // InterruptRecord / attention machinery is involved — that is a mind concept.
    if (this._forAgent()) {
      this.fire("task", { text: input, clientId: clientInfo.clientId });
      return;
    }

    // Create an urgent external stimulus and put it on the interrupt bus.
    // Store the raw user input in `reason`, the mind's companion as `from`, and the
    // mind's ambient language as `lang`: the framing "<from> says: …" (in that
    // language) is added by `renderStimulus()` for the model's frame,
    // while the raw words stay available for the UI (A2/B2/B3).
    const interrupt = stimulus({
      source: "WebSocketClient",
      type: "UserInput",
      reason: input,
      from: this._mindIdentity?.interlocutor || null,
      lang: langOf(this),
      salience: 1,
      urgent: true,
      context: {
        clientId: clientInfo.clientId,
        timestamp: new Date().toISOString()
      }
    });

    this.fire("interrupt-request", interrupt);
  }

  /**
   * Handle a lifecycle control message. Only honored when MEDITATOR_WS_CONTROL=1
   * (set by the Studio supervisor on the minds it spawns), so the public ws:7627
   * contract is never a remote off-switch for a directly-run mind.
   * @param {string} action - currently only "sleep"
   */
  async handleControlMessage(action) {
    if (process.env.MEDITATOR_WS_CONTROL !== "1") {
      log.debug(`Ignoring ws control "${action}" — MEDITATOR_WS_CONTROL not enabled.`);
      return;
    }
    if (action === "sleep") {
      // An intent, not a call on the minds (message-rule.md M1): the process
      // hears it and runs the sleep ritual for every mind in it, then exits; the
      // exit code says whether the sleep was confirmed (the supervisor reads it).
      log.log("Sleep requested via websocket control.");
      this.fire("sleep-requested", { by: "ws" });
    }
  }

  // -------------------------------------------------------------- transport

  /**
   * Handle stream chunk events
   * @param {string} chunk - The chunk content
   */
  onChunk = (chunk) => {
    // Broadcast chunk to all connected clients
    this.broadcastToClients({
      type: "thought_fragment",
      data: {
        content: chunk,
        complete: false
      }
    });
  };

  /**
   * Handle stream state change events
   * @param {Object} stateInfo - Information about the state change
   */
  onState = (stateInfo) => {
    // Broadcast state changes to all connected clients
    this.broadcastToClients({
      type: "status",
      data: {
        state: stateInfo.newState,
        previousState: stateInfo.oldState,
        timestamp: stateInfo.timestamp
      }
    });
  };

  // ------------------------------------------------------------ instrument

  /** The mind this websocket belongs to. */
  _mind() {
    return closestRole(this, "mind") || this.parentElement;
  }

  /** Studio assigns one supervisor port per child process. A society may contain
   *  several m-ws components for direct member debugging; only the public socket
   *  should take the supervisor override, while the rest keep their authored
   *  port= values. For a lone mind, the env override remains the old behavior. */
  _listenPort() {
    const envPort = process.env.MEDITATOR_WS_PORT;
    const ownPort = this.attr("port") || "7627";
    if (!envPort) return ownPort;
    const society = closestRole(this, "society");
    if (!society) return envPort;
    return this._isSocietyPublicSocket(society) ? envPort : ownPort;
  }

  _isSocietyPublicSocket(society) {
    for (const mind of part(society, "mind")) {
      const ws = mind.querySelector("m-ws");
      if (ws) return ws === this;
    }
    return false;
  }

  /** A control socket inside a society is the society's public membrane, so it
   *  waits for the whole population to come up, not only the member that owns
   *  m-ws. (Its sleep control needs no list: the process sleeps every mind.) */
  _controlScopeMinds() {
    const society = closestRole(this, "society");
    if (society) {
      const minds = part(society, "mind");
      if (minds.length) return minds;
    }
    const mind = this._mind();
    return mind ? [mind] : [];
  }

  /** True when this socket belongs to an agent rather than a mind — it is then
   *  a task port, not a mind window (agent-loop.md §10). */
  _forAgent() {
    return !!closestRole(this, "agent") && !closestRole(this, "mind");
  }

  /** Wait (up to ~5s) for the mind and its stream to upgrade into Amanita
   *  components, so topic refs resolve instead of racing the upgrade. */
  async _whenReady() {
    // An agent has no m-stream to wait on — just wait for the <m-agent> to upgrade so
    // its status topic resolves, then return.
    if (this._forAgent()) {
      for (let i = 0; i < 100; i++) {
        const agent = closestRole(this, "agent");
        if (agent && agent.on) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return;
    }
    for (let i = 0; i < 100; i++) {
      const minds = this._controlScopeMinds();
      const ready = minds.length && minds.every(mind => {
        const stream = mind && mind.querySelector("m-stream");
        return mind && mind.on && stream && stream.on;
      });
      if (ready) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * Subscribe to the mind's internal signals and forward them as structured
   * {type:"event", data:{process, kind, at, ...}} telemetry. Every tap is
   * guarded so a minimal mind stays quiet.
   */
  _instrument() {
    const mind = this._mind();
    if (!mind) return;

    // The assembled attention frame for each thinking burst — what the model saw.
    this.sub("!scope/prompt", payload => {
      if (!payload) return;
      if (typeof payload === "string") {
        this._emit("mind", "frame", { frameKind: "raw", frame: payload.slice(0, 8000) });
        return;
      }
      // The frame is now three turns: system, the instruction (a user turn), and the
      // thought in progress (the assistant prefill the model continues). Emit them as
      // distinct fields so the inspector can label each role faithfully (A3).
      this._emit("mind", "frame", {
        frameKind: payload.kind || "continue",
        system: (payload.system || "").slice(0, 8000),
        instruction: (payload.instruction || "").slice(0, 8000),
        frame: (payload.prefill || payload.frame || "").slice(0, 8000),
        prefix: payload.prefix || null,
      });
    });

    // The burst cadence (the fixed tick), so a viewer can pace its display —
    // slowing the reveal to fill the slack between bursts.
    this.sub("!scope/pace", pace => pace && this._emit("mind", "pace", { tickMs: pace.tickMs }));

    // Every bid for attention (observers, timers, console, ws) and every urgent win.
    this.sub("!scope/@interrupt-request", e => {
      const r = (e && e.detail) || {};
      this._emit("attention", "bid", {
        source: r.source, type: r.type, reason: r.reason,
        text: renderStimulus(r),
        salience: r.salience, urgent: !!r.urgent, clearsTail: !!r.clearsTail,
      });
    });
    this.sub("!scope/@interrupt", e => {
      const r = (e && e.detail) || {};
      this._emit("attention", "urgent", {
        type: r.type, reason: r.reason,
        text: renderStimulus(r),
      });
    });

    // The spoken voice, as the classic speech_fragment frame (the public
    // conversation, like thought_fragment from the stream).
    if (this.attr("speechSrc") !== "off") {
      this.sub(this.attr("speechSrc") || "!scope/voice/speech", text => {
        if (typeof text === "string") this.broadcastToClients({ type: "speech_fragment", data: { content: text } });
      }).catch(() => {});
    }

    // Everything else a faculty chooses to show (shared/telemetry.js): the stream's
    // boundaries, memory's state and folds, the arbiter's verdicts, the loop sense,
    // metabolism, the scribe, the hands, the voice and the image. No faculty is
    // looked up here; once listening, ask them for the state they already hold.
    this.sub(`!scope/@${TELEMETRY_EVENT}`, e => this._relayTelemetry(e && e.detail))
      .then(() => { if (this.isConnected) this.fire(TELEMETRY_WANTED, {}) })
      .catch(() => {});

    // If this socket is the public surface of a society, also instrument the
    // private members for the Structure tree. Their events are tagged and marked
    // non-public, so Studio can debug them without mixing their speech/thought
    // into the public conversation stream.
    this._instrumentSocietyPeers(mind);
  }

  /**
   * Instrument an <m-agent> for the Studio (agent-loop.md §13 milestone 4). An agent has
   * no thought stream; its observable life is the tool-calling LOOP. We forward it as:
   *   - status → the classic {type:"status"} frame (drives the header state pill, exactly
   *     the contract a mind's stream state uses), PLUS an `agent/status` telemetry event
   *     carrying the richer {state, step, maxSteps, done} the transcript panel shows.
   *   - each `step` (a fired boundary) → an `agent/step` event: the assistant's text, the
   *     tool calls it made, and the raw observations that came back — the transcript body.
   *   - the final `done` → an `agent/answer` event: the answer, in order, once per task.
   *   - the `tools` set → an `agent/tools` event: the palette of capabilities.
   * The m-agent SUBTREE structure is already sent on connect by handleConnection, so the
   * Studio's Structure column works for an agent with no extra wiring.
   */
  _instrumentAgent() {
    this.sub("!scope/status", status => {
      if (!status) return;
      this.broadcastToClients({ type: "status", data: status });   // header state pill (mind-parallel)
      this._emit("agent", "status", {                              // rich snapshot for the transcript panel
        state: status.state, step: status.step, maxSteps: status.maxSteps, done: !!status.done,
      });
    }).catch(() => {});

    this.sub("!scope/tools", tools => {
      if (!Array.isArray(tools)) return;
      this._emit("agent", "tools", { names: tools.map(t => t?.function?.name).filter(Boolean) });
    }).catch(() => {});

    // `step` and `done` are FIRED events on the m-agent element (like m-stream's boundary),
    // so subscribe with the "@" event ref and read the payload from e.detail.
    this.sub("!scope/@step", e => {
      const step = e && e.detail;
      if (!step) return;
      this._emit("agent", "step", {
        index: step.index,
        assistantText: (step.assistantText || "").slice(0, 8000),
        calls: (step.calls || []).map(c => ({ name: c.name, args: c.args })),
        observations: (step.observations || []).map(o => ({
          name: o.name, isError: !!o.isError, observation: (o.observation || "").slice(0, 8000),
        })),
      });
    }).catch(() => {});

    this.sub("!scope/@done", e => {
      const d = e && e.detail;
      if (!d) return;
      this._emit("agent", "answer", { answer: (d.answer || "").slice(0, 8000), reason: d.reason || null, steps: d.steps });
    }).catch(() => {});
  }

  _instrumentSocietyPeers(publicMind) {
    const society = closestRole(this, "society");
    if (!society) return;
    for (const mind of part(society, "mind")) {
      if (mind === publicMind) continue;
      this._instrumentPeerMind(mind);
    }
  }

  _instrumentPeerMind(mind) {
    const member = mind.getAttribute("name");
    if (!member) return;
    const emit = (process, kind, payload = {}) => this._emit(process, kind, { member, public: false, ...payload });
    const subMind = (suffix, cb) => this.sub(`!cluster/${member}/${suffix}`, cb);
    subMind("prompt", payload => {
      if (!payload) return;
      if (typeof payload === "string") return emit("mind", "frame", { frameKind: "raw", frame: payload.slice(0, 8000) });
      emit("mind", "frame", {
        frameKind: payload.kind || "continue",
        system: (payload.system || "").slice(0, 8000),
        instruction: (payload.instruction || "").slice(0, 8000),
        frame: (payload.prefill || payload.frame || "").slice(0, 8000),
        prefix: payload.prefix || null,
      });
    });
    subMind("pace", pace => pace && emit("mind", "pace", { tickMs: pace.tickMs }));
    subMind("@interrupt-request", e => {
      const r = (e && e.detail) || {};
      emit("attention", "bid", {
        source: r.source, type: r.type, reason: r.reason,
        text: renderStimulus(r),
        salience: r.salience, urgent: !!r.urgent, clearsTail: !!r.clearsTail,
      });
    });
    subMind("@interrupt", e => {
      const r = (e && e.detail) || {};
      emit("attention", "urgent", { type: r.type, reason: r.reason, text: renderStimulus(r) });
    });

    // A member's faculties report to their own membrane; hear them there. (No
    // telemetry-wanted here: a member's transport would ask, not the society's.)
    subMind(`@${TELEMETRY_EVENT}`, e => this._relayTelemetry(e && e.detail, { member, public: false }));
  }

  /** Forward one faculty's telemetry record (shared/telemetry.js). A malformed
   *  record is dropped; the route stays the record's own. */
  _relayTelemetry(record, tags = null) {
    if (!record || typeof record.process !== "string" || typeof record.kind !== "string") return;
    const data = record.data && typeof record.data === "object" ? record.data : {};
    this._emit(record.process, record.kind, tags ? { ...tags, ...data } : data);
  }

  /** Broadcast one telemetry event and remember it as the latest of its kind. */
  _emit(process, kind, payload) {
    const msg = { type: "event", data: { process, kind, at: new Date().toISOString(), ...payload } };
    this._snapshot.set(`${payload?.member || ""}:${process}/${kind}`, msg);
    this.broadcastToClients(msg);
  }

  /** Serialize the debug scope once (a society when this is its public socket,
   *  otherwise the single mind). The structure is static after load. */
  _structure() {
    if (this._structureCache) return this._structureCache;
    const root = closestRole(this, "society") || this._mind();
    if (!root) return null;
    this._structureCache = this._serializeTree(root);
    return this._structureCache;
  }

  _serializeTree(el) {
    const attrs = {};
    for (const a of Array.from(el.attributes || [])) attrs[a.name] = a.value;
    const children = [];
    for (const child of Array.from(el.children || [])) {
      if ((child.tagName || "").toLowerCase().startsWith("m-")) children.push(this._serializeTree(child));
    }
    return {
      tag: (el.tagName || "").toLowerCase(),
      name: el.getAttribute ? el.getAttribute("name") : null,
      attrs,
      text: this._directText(el),
      children,
    };
  }

  // ---------------------------------------------------------------- the Plenum camera
  /** Snapshot every positioned component in the debug scope — Camera Diserta: the
   *  god view exists only here, read from state each component owns (plenum.md §5). */
  _layout() {
    const root = closestRole(this, "society") || this._mind();
    if (!root) return [];
    // Mirror _serializeTree's scope exactly (m-* nesting only, no archetype
    // templates), so the viewer can pair entries with its graph nodes in order.
    const positions = [];
    const walk = el => {
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "m-archetype") return;
      if (el.pos) {
        positions.push({
          member: closestRole(el, "mind")?.getAttribute("name") || null,
          name: el.getAttribute("name") || null,
          tag,
          pos: { x: el.pos.x, y: el.pos.y, z: el.pos.z },
        });
      }
      for (const child of Array.from(el.children || [])) {
        if ((child.tagName || "").toLowerCase().startsWith("m-")) walk(child);
      }
    };
    walk(root);
    return positions;
  }

  /** Run the layout ticker exactly while someone is watching. */
  _syncLayoutTicker() {
    const wants = this.clients.size > 0;
    if (wants && !this._layoutTimer) {
      this._layoutTimer = setInterval(() => {
        const positions = this._layout();
        if (positions.length) this.broadcastToClients({ type: "layout", data: { positions } });
      }, 1000);
    }
    if (!wants && this._layoutTimer) {
      clearInterval(this._layoutTimer);
      this._layoutTimer = null;
    }
  }

  /** Direct text content only (e.g. the identity prose on m-mind), capped. */
  _directText(el) {
    let text = "";
    for (const node of Array.from(el.childNodes || [])) {
      if (node.nodeType === 3 /* TEXT_NODE */) text += node.textContent;
    }
    text = text.trim();
    return text ? text.slice(0, 2000) : null;
  }

  // ------------------------------------------------------------------ send

  /**
   * Send a message to a specific client
   * @param {WebSocket} client - The client to send to
   * @param {Object} message - The message to send (will be JSON-stringified)
   */
  sendToClient(client, message) {
    if (client.readyState === client.OPEN) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        log.error("Error sending to client:", error);
      }
    }
  }

  /**
   * Broadcast a message to all connected clients
   * @param {Object} message - The message to broadcast (will be JSON-stringified)
   */
  broadcastToClients(message) {
    for (const client of this.clients) {
      this.sendToClient(client, message);
    }
  }

  /**
   * Generate a unique client ID
   * @returns {string} A unique client ID
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
}
