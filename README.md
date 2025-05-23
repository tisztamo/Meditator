# Meditator

*- WARNING: Meditator is mostly docware yet! -*

**Meditator** is an AI agent emitting a continual flow of thoughts. It is designed to maintain a persistent state in the form of a knowledge base. Using this knowledge base, the agent continuously executes streaming calls to Large Language Models (LLMs), generating a flowing "stream of consciousness." When external or internal events occur — such as an incoming user prompt, a tool invocation result, a periodic timeout or an associative break — the ongoing thought is interrupted, and a new set of non-streamed LLM calls determines the next prompt and resumes the stream of consciousness. Under the hood there is an AI agent framework - The Meditator Framework - which allows you to program your agent in HTML without coding, using only structured prompts and execute it with ease. These prompts adhere to a spec and are executed using a set of standard components written in the component framework called Amanita. Amanita provides a highly declarative way to build applications with web components that refer each other using a pub-sub mechanism and a simple query language to target subscription binding. Amanita, and thus Meditator can run both on the server and in the browser.

## Features

- **Stateful Knowledge Base**  
  A tree of Markdown and metadata files stored in a git repo keeps track of the agent's accumulated knowledge. Metadata is stored as English prose in Markdown format, following a flexible structure that can evolve over time. While default metadata configurations are provided, users can customize them by adding a configuration prompt file to their repository, allowing tailored organization and context management to suit specific project requirements.  
- **Streaming LLM Calls**  
  The AI agent generates a continuous flow of text in real-time, simulating a persistent stream of thoughts.  
- **Interrupt and Resume**  
  External events stop the current stream and trigger a short pipeline of non-streamed LLM calls to decide on the next prompt for the ongoing stream.
- **Tools**
  Standard tooling like secure python execution and web search is available.
- **Console and Websocket Output**  
  The stream of consciousness can be displayed in a console or streamed to a websocket for real-time updates.  
- **Web Application**  
  A complementary web interface is provided to visualize the agent's stream and accept user inputs.

## Architecture Overview

1. **Knowledge Base (File System)**  
   - Organizes knowledge into **Abstractions** (directories) and **Atoms** (Markdown files), collectively called **Topics**.  
   - Each Abstraction contains an `index.md` with a title, description, and links to related Topics. Metadata is stored in `index.meta.md`.  
   - Atoms represent individual knowledge units with optional `<atom>.meta.md` files for metadata.  
   - The agent interacts with this structure to maintain persistent, evolving context.  

2. **LLM Streams**  
   - Continuous calls to an LLM produce a "stream of consciousness" printed to the console or sent through a websocket.  
   - When the stream is active, it represents the AI's on-the-fly thought process, including intermediate ideas and reasoning.  

3. **Interrupt Mechanism**  
   - External triggers—user messages, API calls, or elapsed time—pause the stream.  
   - A short pipeline of non-streamed calls to an LLM decides how to respond and how to proceed with the next stream, if any.  

4. **Web Application**  
   - A web server that provides a user interface for real-time viewing of the stream and an input interface to interact with the AI.  

## Installation & Usage

1. **Installation**  
   - Ensure you have [Bun](https://bun.sh) installed (for the webapp and any tooling).  
   - Install any required packages:  
     ```bash
     bun install
     ```
   - You may also need Python or other dependencies depending on the specific LLM or integration you use.

2. **Launching the Agent**  
   - Start the system: `bun run meditator.js`  
   - Observe the continuous stream of text output in the console or via a websocket endpoint.
   - Press Ctrl-C to stop.

3. **Interacting**  
   - Use the provided web interface or WebSocket API to send new prompts.  
   - On receiving a new prompt, the agent's current stream is halted, a short decision pipeline is executed, and a new stream begins with the updated context.

4. **Using WebSockets**
   - The agent can stream its thoughts via WebSocket on port 7627
   - Connect to `ws://localhost:7627/stream` to receive the stream
   - A basic web client is included at `src/client/websocket-client.html`
   - Run the client: `bun run src/client/server.js` and visit http://localhost:3000
   - Alternatively, use the setup script: `bun run setup-and-run.js` to start everything at once

## Configuration

- **LLM Provider**  
  Configure your environment variables or set up an API key for your chosen LLM provider.  
- **Timeout and Triggers**  
  Adjust thresholds for timeouts or maximum token usage to control when and how the system interrupts itself.  
- **File Storage**  
  Point the agent to a desired directory path for storing the Markdown knowledge base.

## Contributing

Contributions are welcome! Your genius code edits and AI's existential crises belong here.

## License

This project is available under the MIT License. See [LICENSE](./LICENSE) for details.

## Support

- For questions, suggestions, or issues, please open an [Issue](../../issues).  
- Feel free to submit pull requests to improve or expand functionality.

Thank you for using **Meditator**. We hope it enhances your AI development experience with continuous, long-term context and a truly streaming flow of thoughts!

**Note**: This project was developed using [AI Junior](https://aijunior.dev).

