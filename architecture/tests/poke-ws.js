// Sends one message to a running Meditator over websocket:
//   bun architecture/tests/poke-ws.js "Hello little mind"
import WebSocket from "ws";

const message = process.argv[2] || "Hello, little mind.";
const ws = new WebSocket("ws://localhost:7627");

ws.on("open", () => {
    ws.send(JSON.stringify({ type: "input", data: { message } }));
    console.log(`sent: ${message}`);
    setTimeout(() => { ws.close(); process.exit(0); }, 1000);
});
ws.on("error", error => {
    console.error("ws error:", error.message);
    process.exit(1);
});
