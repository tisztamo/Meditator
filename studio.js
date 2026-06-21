import { parseStudioCLI } from "./src/studio/cli.js";
parseStudioCLI();
await import("./src/studio/server.js");
