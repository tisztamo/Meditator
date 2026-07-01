import { MBaseComponent } from "./mBaseComponent.js";
import { InterruptRecord } from "../infrastructure/interruptRecord.js";
import { langOf } from "./i18n.js";
import { logger } from "../infrastructure/logger.js";

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
 * All instrumentation taps are GUARDED: a minimal mind without economy/memory/
 * speech simply emits fewer events. Multiple clients may connect at once; a
 * freshly connected client is sent the structure plus the latest snapshot of
 * every signal, so it has the whole picture immediately.
 *
 * @interface
 * Attributes:
 *   - port: Port to listen on for WebSocket connections (defaults to 7627)
 *   - src / stateSrc: override which topics feed thought_fragment / status
 *
 * Subscriptions (transport): "..m-mind/stream/chunk", "..m-mind/stream/state"
 * Subscriptions (instrument, guarded): "../prompt", "/stream/@boundary",
 *   "../@interrupt-request", "../@interrupt", "/<arbiter>/decision",
 *   "/<economy>/energy", "/<memory>/compressed", "/<scribe>/filed",
 *   "/<hands>/intent", "/<hands>/acted",
 *   "/<voice>/speech", "/<voice>/speaking", "/<voice>/impulse",
 *   "/<voice>/speech-boundary", "/<image>/generated"
 *
 * Topics published to: "interrupt-request" (when client input is received)
 */
export class MWs extends MBaseComponent {
  server = null;
  clients = new Set();
  clientBuffers = new Map();
  _snapshot = new Map();      // "process/kind" -> last message, replayed to new clients
  _structureCache = null;

  /**
   * Set up the WebSocket server when the component connects
   */
  async onConnect() {
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

      // Subscribe to stream chunks and state changes. Mind-relative refs (..m-mind/…)
      // so this binds to ITS OWN mind's stream even when several minds run together in
      // one document (a society); for a lone mind it resolves to the very same element
      // the old absolute "/stream/chunk" did. These power the classic, backward-
      // compatible thought_fragment / status messages.
      this.sub(this.attr("src") || "..m-mind/stream/chunk", this.onChunk);
      this.sub(this.attr("stateSrc") || "..m-mind/stream/state", this.onState);

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

    // Set up client event handlers
    client.on("message", (data) => this.handleClientMessage(client, data));

    client.on("close", () => {
      log.debug(`WebSocket client disconnected: ${clientId}`);
      this.clients.delete(client);
      this.clientBuffers.delete(client);
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
    // language) is added by `InterruptRecord.renderForFrame()` for the model's frame,
    // while the raw words stay available for the UI (A2/B2/B3).
    const interrupt = new InterruptRecord({
      source: "WebSocketClient",
      type: "UserInput",
      reason: input,
      from: this._mind()?.interlocutorName?.() || null,
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
      log.log("Sleep requested via websocket control.");
      const minds = this._controlScopeMinds();
      try {
        await Promise.all(minds.map(mind => Promise.resolve(mind && mind.sleep && mind.sleep())));
      } catch (error) {
        log.warn("Sleep ritual error:", error.message);
      }
      log.log("Asleep. Goodbye.");
      process.exit(0);
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
    return this.closest("m-mind") || this.parentElement;
  }

  /** Studio assigns one supervisor port per child process. A society may contain
   *  several m-ws components for direct member debugging; only the public socket
   *  should take the supervisor override, while the rest keep their authored
   *  port= values. For a lone mind, the env override remains the old behavior. */
  _listenPort() {
    const envPort = process.env.MEDITATOR_WS_PORT;
    const ownPort = this.attr("port") || "7627";
    if (!envPort) return ownPort;
    const society = this.closest("m-society");
    if (!society) return envPort;
    return this._isSocietyPublicSocket(society) ? envPort : ownPort;
  }

  _isSocietyPublicSocket(society) {
    for (const mind of Array.from(society.children)) {
      if ((mind.tagName || "").toLowerCase() !== "m-mind") continue;
      const ws = mind.querySelector("m-ws");
      if (ws) return ws === this;
    }
    return false;
  }

  /** A control socket inside a society is the society's public membrane. Sleeping
   *  it should settle the whole population, not only the member that owns m-ws. */
  _controlScopeMinds() {
    const society = this.closest("m-society");
    if (society) {
      const minds = Array.from(society.querySelectorAll("m-mind"))
        .filter(m => m.closest("m-society") === society);
      if (minds.length) return minds;
    }
    const mind = this._mind();
    return mind ? [mind] : [];
  }

  /** True when this socket belongs to an <m-agent> rather than an <m-mind> — it is then
   *  a task port, not a mind window (agent-loop.md §10). */
  _forAgent() {
    return !!this.closest("m-agent") && !this.closest("m-mind");
  }

  /** Wait (up to ~5s) for the mind and its stream to upgrade into Amanita
   *  components, so topic refs resolve instead of racing the upgrade. */
  async _whenReady() {
    // An agent has no m-stream to wait on — just wait for the <m-agent> to upgrade so
    // its status topic resolves, then return.
    if (this._forAgent()) {
      for (let i = 0; i < 100; i++) {
        const agent = this.closest("m-agent");
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
    this.sub("../prompt", payload => {
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

    // Burst boundaries (a transient `@boundary` event), plus a memory snapshot taken at each.
    this._subEvent(mind.querySelector("m-stream"), "boundary", boundary => {
      if (!boundary) return;
      this._emit("stream", "boundary", {
        reason: boundary.reason,
        burstIndex: boundary.burstIndex,
        burstChars: boundary.burstChars,
      });
      const memory = mind.querySelector("m-memory");
      if (memory && memory.getTail) {
        this._emit("memory", "state", {
          tailLen: memory.getTail().length,
          recentLen: memory.getRecent ? memory.getRecent().length : 0,
          storyLen: memory.getStory ? memory.getStory().length : 0,
        });
      }
    });

    // The burst cadence (the fixed tick), so a viewer can pace its display —
    // slowing the reveal to fill the slack between bursts.
    this.sub("../pace", pace => pace && this._emit("mind", "pace", { tickMs: pace.tickMs }));

    // Every bid for attention (observers, timers, console, ws) and every urgent win.
    this.sub("../@interrupt-request", e => {
      const r = (e && e.detail) || {};
      this._emit("attention", "bid", {
        source: r.source, type: r.type, reason: r.reason,
        text: r.renderForFrame?.(),
        salience: r.salience, urgent: !!r.urgent, clearsTail: !!r.clearsTail,
      });
    });
    this.sub("../@interrupt", e => {
      const r = (e && e.detail) || {};
      this._emit("attention", "urgent", {
        type: r.type, reason: r.reason,
        text: r.renderForFrame?.(),
      });
    });

    // The arbiter's accept/drop verdict.
    this._subProp(mind.querySelector("m-interrupts"), "decision",
      d => d && this._emit("attention", "decision", d));

    // The loop sense: standing state about whether the mind is circling, and on what
    // vocabulary — published like economy/arousal, read here purely for observability.
    this._subProp(mind.querySelector("m-loop-detector"), "loop",
      l => l && this._emit("loop", "state", l));

    // Metabolism: energy, spend, and the resulting pace multiplier.
    const economy = mind.querySelector("m-economy");
    this._subProp(economy, "energy", energy => this._emit("economy", "energy", {
      energy,
      spent: economy ? economy.spent : null,
      paceFactor: typeof economy?.paceFactor === "number" ? economy.paceFactor : 1,
    }));

    // Memory consolidation.
    this._subProp(mind.querySelector("m-memory"), "compressed", c => c && this._emit("memory", "compressed", {
      recentLen: (c.recent || "").length,
      storyLen: (c.story || "").length,
      recentPreview: (c.recent || "").slice(0, 400),
      storyPreview: (c.story || "").slice(0, 400),
    }));

    // The scribe filing knowledge (a transient `@filed` event, not a topic).
    this._subEvent(mind.querySelector("m-kb"), "filed",
      f => f && this._emit("scribe", "filed", { files: f.files || [] }));

    // The hands reaching out (present only when <m-act> is in the mind). `intent`
    // is every decide (for observability, like speech's impulse); `acted` is a deed.
    const act = mind.querySelector("m-act");
    this._subProp(act, "intent", i => i && this._emit("act", "intent", i));
    this._subEvent(act, "acted", a => a && this._emit("act", "acted", {
      capability: a.capability, intent: a.intent, ok: !!a.ok,
      experience: a.experience, args: a.args, data: a.data,
    }));

    // The speaking voice (present only when <m-speech> is in the mind).
    const speech = mind.querySelector("m-speech");
    this._subProp(speech, "speech", text => {
      if (typeof text === "string") this.broadcastToClients({ type: "speech_fragment", data: { content: text } });
    });
    this._subProp(speech, "speaking", speaking => this._emit("speech", "speaking", { speaking: !!speaking }));
    this._subProp(speech, "impulse", imp => imp && this._emit("speech", "impulse", imp));
    this._subProp(speech, "speech-boundary", b => b && this._emit("speech", "boundary", {
      chars: b.chars, reason: b.reason, text: (b.text || "").slice(0, 2000),
    }));

    // Visual generation (present only when <m-image> is in the mind).
    const image = mind.querySelector("m-image");
    this._subProp(image, "generating", generating => this._emit("image", "generating", { generating: !!generating }));
    this._subProp(image, "impulse", imp => imp && this._emit("image", "impulse", imp));
    this._subProp(image, "generated", img => img && this._emit("image", "generated", img));
    this._subProp(image, "error", err => err && this._emit("image", "error", err));

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
    this.sub("..m-agent/status", status => {
      if (!status) return;
      this.broadcastToClients({ type: "status", data: status });   // header state pill (mind-parallel)
      this._emit("agent", "status", {                              // rich snapshot for the transcript panel
        state: status.state, step: status.step, maxSteps: status.maxSteps, done: !!status.done,
      });
    }).catch(() => {});

    this.sub("..m-agent/tools", tools => {
      if (!Array.isArray(tools)) return;
      this._emit("agent", "tools", { names: tools.map(t => t?.function?.name).filter(Boolean) });
    }).catch(() => {});

    // `step` and `done` are FIRED events on the m-agent element (like m-stream's boundary),
    // so subscribe with the "@" event ref and read the payload from e.detail.
    this.sub("..m-agent/@step", e => {
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

    this.sub("..m-agent/@done", e => {
      const d = e && e.detail;
      if (!d) return;
      this._emit("agent", "answer", { answer: (d.answer || "").slice(0, 8000), reason: d.reason || null, steps: d.steps });
    }).catch(() => {});
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
    this.sub("..m-agent/status", status => {
      if (!status) return;
      this.broadcastToClients({ type: "status", data: status });   // header state pill (mind-parallel)
      this._emit("agent", "status", {                              // rich snapshot for the transcript panel
        state: status.state, step: status.step, maxSteps: status.maxSteps, done: !!status.done,
      });
    }).catch(() => {});

    this.sub("..m-agent/tools", tools => {
      if (!Array.isArray(tools)) return;
      this._emit("agent", "tools", { names: tools.map(t => t?.function?.name).filter(Boolean) });
    }).catch(() => {});

    // `step` and `done` are FIRED events on the m-agent element (like m-stream's boundary),
    // so subscribe with the "@" event ref and read the payload from e.detail.
    this.sub("..m-agent/@step", e => {
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

    this.sub("..m-agent/@done", e => {
      const d = e && e.detail;
      if (!d) return;
      this._emit("agent", "answer", { answer: (d.answer || "").slice(0, 8000), reason: d.reason || null, steps: d.steps });
    }).catch(() => {});
  }

  _instrumentSocietyPeers(publicMind) {
    const society = this.closest("m-society");
    if (!society) return;
    for (const mind of Array.from(society.querySelectorAll("m-mind"))) {
      if (mind.closest("m-society") !== society || mind === publicMind) continue;
      this._instrumentPeerMind(mind);
    }
  }

  _instrumentPeerMind(mind) {
    const member = mind.getAttribute("name");
    if (!member) return;
    const emit = (process, kind, payload = {}) => this._emit(process, kind, { member, public: false, ...payload });
    const subMind = (suffix, cb) => this.sub(`..m-society/${member}/${suffix}`, cb);
    const subProp = (el, prop, cb) => {
      if (!el) return;
      const name = el.getAttribute("name");
      if (name) this.sub(`..m-society/${member}/${name}/${prop}`, cb);
    };
    const subEvent = (el, name, cb) => {
      if (!el) return;
      const elName = el.getAttribute("name");
      if (elName) this.sub(`..m-society/${member}/${elName}/@${name}`, e => cb(e && e.detail));
    };

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
        text: r.renderForFrame?.(),
        salience: r.salience, urgent: !!r.urgent, clearsTail: !!r.clearsTail,
      });
    });
    subMind("@interrupt", e => {
      const r = (e && e.detail) || {};
      emit("attention", "urgent", { type: r.type, reason: r.reason, text: r.renderForFrame?.() });
    });

    subEvent(mind.querySelector("m-stream"), "boundary", boundary => {
      if (!boundary) return;
      emit("stream", "boundary", {
        reason: boundary.reason,
        burstIndex: boundary.burstIndex,
        burstChars: boundary.burstChars,
      });
      const memory = mind.querySelector("m-memory");
      if (memory && memory.getTail) {
        emit("memory", "state", {
          tailLen: memory.getTail().length,
          recentLen: memory.getRecent ? memory.getRecent().length : 0,
          storyLen: memory.getStory ? memory.getStory().length : 0,
        });
      }
    });

    subProp(mind.querySelector("m-interrupts"), "decision", d => d && emit("attention", "decision", d));
    subProp(mind.querySelector("m-loop-detector"), "loop", l => l && emit("loop", "state", l));
    const economy = mind.querySelector("m-economy");
    subProp(economy, "energy", energy => emit("economy", "energy", {
      energy,
      spent: economy ? economy.spent : null,
      paceFactor: typeof economy?.paceFactor === "number" ? economy.paceFactor : 1,
    }));
    subProp(mind.querySelector("m-memory"), "compressed", c => c && emit("memory", "compressed", {
      recentLen: (c.recent || "").length,
      storyLen: (c.story || "").length,
      recentPreview: (c.recent || "").slice(0, 400),
      storyPreview: (c.story || "").slice(0, 400),
    }));
    subEvent(mind.querySelector("m-kb"), "filed", f => f && emit("scribe", "filed", { files: f.files || [] }));
    const act = mind.querySelector("m-act");
    subProp(act, "intent", i => i && emit("act", "intent", i));
    subEvent(act, "acted", a => a && emit("act", "acted", {
      capability: a.capability, intent: a.intent, ok: !!a.ok,
      experience: a.experience, args: a.args, data: a.data,
    }));
    const speech = mind.querySelector("m-speech");
    subProp(speech, "speaking", speaking => emit("speech", "speaking", { speaking: !!speaking }));
    subProp(speech, "impulse", imp => imp && emit("speech", "impulse", imp));
    subProp(speech, "speech-boundary", b => b && emit("speech", "boundary", {
      chars: b.chars, reason: b.reason, text: (b.text || "").slice(0, 2000),
    }));
  }

  /** Subscribe to a property of a (possibly absent) named sibling component. */
  _subProp(el, prop, cb) {
    if (!el) return;
    const name = el.getAttribute("name");
    if (!name) {
      log.debug(`Cannot instrument <${(el.tagName || "").toLowerCase()}>: no name attribute`);
      return;
    }
    this.sub(`..m-mind/${name}/${prop}`, cb);
  }

  /** Subscribe to a transient DOM event fired by a (possibly absent) named sibling.
   *  The callback receives the event payload (e.detail) directly, mirroring _subProp's
   *  value — so the relay lambdas above read the same way whether topic or event. */
  _subEvent(el, name, cb) {
    if (!el) return;
    const elName = el.getAttribute("name");
    if (!elName) {
      log.debug(`Cannot instrument <${(el.tagName || "").toLowerCase()}>: no name attribute`);
      return;
    }
    this.sub(`..m-mind/${elName}/@${name}`, e => cb(e && e.detail));
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
    const root = this.closest("m-society") || this._mind();
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
