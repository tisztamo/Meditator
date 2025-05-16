import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Serve static files from the client directory
app.use(express.static(__dirname));

// Route for the WebSocket client
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'websocket-client.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`WebSocket client server running at http://localhost:${PORT}`);
}); 