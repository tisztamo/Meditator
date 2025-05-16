#!/usr/bin/env bun

console.log("Setting up Meditator with WebSocket support...");

// Install dependencies
try {
  console.log("Installing dependencies...");
  await Bun.spawn(["bun", "install"], { stdout: "inherit", stderr: "inherit" });
  console.log("Dependencies installed successfully.");
} catch (error) {
  console.error("Failed to install dependencies:", error);
  process.exit(1);
}

// Start the client server
try {
  console.log("Starting WebSocket client server...");
  const clientServer = Bun.spawn(["bun", "run", "src/client/server.js"], { 
    stdout: "inherit", 
    stderr: "inherit" 
  });
  
  console.log("WebSocket client available at http://localhost:3000");

  // Start Meditator with WebSocket support
  console.log("Starting Meditator with WebSocket support...");
  const meditator = Bun.spawn(["bun", "run", "meditator.js"], { 
    stdout: "inherit", 
    stderr: "inherit" 
  });

  console.log("WebSocket server running on port 7627");
  console.log("Press Ctrl+C to stop all servers");

  // Handle process termination
  process.on("SIGINT", () => {
    console.log("Shutting down servers...");
    clientServer.kill();
    meditator.kill();
    process.exit(0);
  });

  // Wait for child processes to exit
  await Promise.all([
    new Promise(resolve => clientServer.on("exit", resolve)),
    new Promise(resolve => meditator.on("exit", resolve))
  ]);
} catch (error) {
  console.error("Error starting servers:", error);
  process.exit(1);
} 