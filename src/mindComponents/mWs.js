import { MBaseComponent } from "./mBaseComponent.js";
import { InterruptRecord } from "../infrastructure/interruptRecord.js";
import { logger } from "../infrastructure/logger.js";

const log = logger("mWs.js");

/**
 * WebSocket server component that handles client connections, input and output streaming.
 * Allows multiple parallel connections and sends chunk stream to all connected clients.
 * 
 * @interface
 * Attributes:
 *   - port: Port to listen on for WebSocket connections (defaults to 7627)
 * 
 * Subscriptions:
 *   - "../chunk": Receives chunks from stream component to send to clients
 *   - "../state": Receives state changes from stream component
 * 
 * Topics published to:
 *   - "interrupt-request": When client input is received
 */
export class MWs extends MBaseComponent {
  server = null;
  clients = new Set();
  clientBuffers = new Map();
  
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
      
      // Subscribe to stream chunks and state changes
      this.sub("../chunk", this["../chunk"]);
      this.sub("../state", this["../state"]);
      
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
    
    // Create an interrupt record
    const interrupt = new InterruptRecord({
      source: "WebSocketClient",
      type: "UserInput",
      reason: input,
      context: {
        clientId: clientInfo.clientId,
        timestamp: new Date().toISOString()
      }
    });
    
    // Publish interrupt request
    this.pub("interrupt-request", interrupt.toMarkdown());
  }
  
  /**
   * Handle stream chunk events
   * @param {string} chunk - The chunk content
   */
  "../chunk" = (chunk) => {
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
  "../state" = (stateInfo) => {
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