import { MBaseComponent } from "./mBaseComponent.js";
import { InterruptRecord } from "../infrastructure/interruptRecord.js";
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
 * Subscriptions (transport): "/stream/chunk", "/stream/state"
 * Subscriptions (instrument, guarded): "../prompt", "/stream/boundary",
 *   "../@interrupt-request", "../@interrupt", "/<arbiter>/decision",
 *   "/<economy>/energy", "/<memory>/compressed", "/<scribe>/filed",
 *   "/<voice>/speech", "/<voice>/speaking", "/<voice>/impulse",
 *   "/<voice>/speech-boundary"
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

      // Get port from attribute or use default
      const port = parseInt(this.attr("port") || "7627", 10);

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

      // Subscribe to stream chunks and state changes (absolute refs so this
      // component can live anywhere in the mind). These power the classic,
      // backward-compatible thought_fragment / status messages.
      this.sub(this.attr("src") || "/stream/chunk", this.onChunk, 12);
      this.sub(this.attr("stateSrc") || "/stream/state", this.onState, 12);

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

    // Create an urgent external stimulus and put it on the interrupt bus
    const interrupt = new InterruptRecord({
      source: "WebSocketClient",
      type: "UserInput",
      reason: `A voice arrives from outside: "${input}"`,
      salience: 1,
      urgent: true,
      context: {
        clientId: clientInfo.clientId,
        timestamp: new Date().toISOString()
      }
    });

    this.dispatchEvent(new CustomEvent("interrupt-request", { bubbles: true, detail: interrupt }));
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

  /** Wait (up to ~5s) for the mind and its stream to upgrade into Amanita
   *  components, so topic refs resolve instead of racing the upgrade. */
  async _whenReady() {
    for (let i = 0; i < 100; i++) {
      const mind = this._mind();
      const stream = mind && mind.querySelector("m-stream");
      if (mind && mind.on && stream && stream.on) return;
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
      this._emit("mind", "frame", {
        frameKind: payload.kind || "continue",
        system: (payload.system || "").slice(0, 8000),
        frame: (payload.frame || "").slice(0, 8000),
        prefix: payload.prefix || null,
      });
    });

    // Burst boundaries, plus a memory snapshot taken at each boundary.
    this._subProp(mind.querySelector("m-stream"), "boundary", boundary => {
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

    // Every bid for attention (observers, timers, console, ws) and every urgent win.
    this.sub("../@interrupt-request", e => {
      const r = (e && e.detail) || {};
      this._emit("attention", "bid", {
        source: r.source, type: r.type, reason: r.reason,
        salience: r.salience, urgent: !!r.urgent,
      });
    });
    this.sub("../@interrupt", e => {
      const r = (e && e.detail) || {};
      this._emit("attention", "urgent", { type: r.type, reason: r.reason });
    });

    // The arbiter's accept/drop verdict.
    this._subProp(mind.querySelector("m-interrupts"), "decision",
      d => d && this._emit("attention", "decision", d));

    // Metabolism: energy, spend, and the resulting pace multiplier.
    const economy = mind.querySelector("m-economy");
    this._subProp(economy, "energy", energy => this._emit("economy", "energy", {
      energy,
      spent: economy ? economy.spent : null,
      paceFactor: economy && economy.paceFactor ? economy.paceFactor() : 1,
    }));

    // Memory consolidation.
    this._subProp(mind.querySelector("m-memory"), "compressed", c => c && this._emit("memory", "compressed", {
      recentLen: (c.recent || "").length,
      storyLen: (c.story || "").length,
      recentPreview: (c.recent || "").slice(0, 400),
      storyPreview: (c.story || "").slice(0, 400),
    }));

    // The scribe filing knowledge.
    this._subProp(mind.querySelector("m-kb"), "filed",
      f => f && this._emit("scribe", "filed", { files: f.files || [] }));

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
  }

  /** Subscribe to a property of a (possibly absent) named sibling component. */
  _subProp(el, prop, cb) {
    if (!el) return;
    const name = el.getAttribute("name");
    if (!name) {
      log.debug(`Cannot instrument <${(el.tagName || "").toLowerCase()}>: no name attribute`);
      return;
    }
    this.sub(`/${name}/${prop}`, cb, 12);
  }

  /** Broadcast one telemetry event and remember it as the latest of its kind. */
  _emit(process, kind, payload) {
    const msg = { type: "event", data: { process, kind, at: new Date().toISOString(), ...payload } };
    this._snapshot.set(`${process}/${kind}`, msg);
    this.broadcastToClients(msg);
  }

  /** Serialize the mind's component tree once (it is static after load). */
  _structure() {
    if (this._structureCache) return this._structureCache;
    const mind = this._mind();
    if (!mind) return null;
    this._structureCache = this._serializeTree(mind);
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
