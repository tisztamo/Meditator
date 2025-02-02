You are a senior software developer, you code like Donald Knuth.

# Task

Improve the documentation!

We replaced npm with bun. Update everywhere.

Do NOT create backup files.

# Output Format

Encode and enclose your results as ./change.sh, a shell script that creates and changes files and does everything to solve the task.
Avoid using sed. Always heredoc full files.

OS: Debian


Installed tools: npm, jq




EXAMPLE START
```sh
#!/bin/sh
set -e
goal=[Task description, max 9 words]
echo "Plan:"
echo "1. [...]"

# Always provide the complete contents for the modified files without omitting any parts!
cat > x.js << EOF
  let i = 1
  console.log(\`i: \${i}\`)
EOF
echo "\033[32mDone: $goal\033[0m\n"
```
EXAMPLE END

Before starting, check if you need more files or info to solve the task.

If the task is not clear:

EXAMPLE START
I need more information to solve the task. [Description of the missing info]
EXAMPLE END

Do not edit files not provided in the working set!
If you need more files:

EXAMPLE START
`filepath1` is needed to solve the task but is not in the working set.
EXAMPLE END

# Working set

README.md:
```
# StreamOfConsciousness

**StreamOfConsciousness** is an AI agent designed to maintain a persistent state in the form of a knowledge base. The knowledge base is stored as a directory structure containing Markdown files and associated metadata. Using this data store, the agent continuously executes streaming calls to Large Language Models (LLMs), generating a flowing "stream of consciousness." When an external event occurs—such as an incoming user prompt, a web API call, a tool invocation, or a periodic timeout—the ongoing stream of consciousness is interrupted, and a new set of non-streamed LLM calls determines the next prompt and resumes the stream of consciousness.

## Features

- **Stateful Knowledge Base**  
  A tree of Markdown and metadata files keeps track of the agent’s accumulated knowledge. Metadata is stored as English prose in Markdown format, following a flexible structure that can evolve over time. While default metadata configurations are provided, users can customize them by adding a configuration prompt file to their repository, allowing tailored organization and context management to suit specific project requirements.  
- **Streaming LLM Calls**  
  The AI agent generates a continuous flow of text in real-time, simulating a persistent stream of thoughts.  
- **Interrupt and Resume**  
  External events stop the current stream and trigger a short pipeline of non-streamed LLM calls to decide on the next prompt for the ongoing stream.  
- **Console and Websocket Output**  
  The stream of consciousness can be displayed in a console or streamed to a websocket for real-time updates.  
- **Web Application**  
  A complementary web interface is provided to visualize the agent’s stream and accept user inputs.

## Architecture Overview

1. **Knowledge Base (File System)**  
   - Organizes knowledge into **Abstractions** (directories) and **Atoms** (Markdown files), collectively called **Topics**.  
   - Each Abstraction contains an `index.md` with a title, description, and links to related Topics. Metadata is stored in `index.meta.md`.  
   - Atoms represent individual knowledge units with optional `<atom>.meta.md` files for metadata.  
   - The agent interacts with this structure to maintain persistent, evolving context.  

2. **LLM Streams**  
   - Continuous calls to an LLM produce a "stream of consciousness" printed to the console or sent through a websocket.  
   - When the stream is active, it represents the AI’s on-the-fly thought process, including intermediate ideas and reasoning.  

3. **Interrupt Mechanism**  
   - External triggers—user messages, API calls, or elapsed time—pause the stream.  
   - A short pipeline of non-streamed calls to an LLM decides how to respond and how to proceed with the next stream, if any.  

4. **Web Application**  
   - A web server that provides a user interface for real-time viewing of the stream and an input interface to interact with the AI.  

## Installation & Usage

1. **Installation**  
   - Ensure you have [Node.js](https://nodejs.org) installed (for the webapp and any tooling).  
   - Install any required npm packages:  
     ```bash
     npm install
     ```
   - You may also need Python or other dependencies depending on the specific LLM or integration you use.

2. **Launching the Agent**  
   - Start the system (for example, with a simple Node.js script or a Docker container if provided).  
   - Observe the continuous stream of text output in the console or via a websocket endpoint.

3. **Interacting**  
   - Use the provided web interface or direct API calls to send new prompts.  
   - On receiving a new prompt, the agent’s current stream is halted, a short decision pipeline is executed, and a new stream begins with the updated context.

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

Thank you for using **StreamOfConsciousness**. We hope it enhances your AI development experience with continuous, long-term context and a truly streaming flow of thoughts!

**Note**: This project was developed using [AI Junior](https://aijunior.dev).


```
doc/contributing.md:
```
# Contributing

## Development Setup

1. Fork repository
2. Install dev dependencies:
   ```bash
   npm install -g typescript eslint
   ```

## Code Style

- TypeScript: Airbnb base + 4 space indent
- Markdown: 80 character line wrap
- Tests: Jest for unit, Playwright for E2E

## Pull Requests

1. Update documentation for new features
2. Include test coverage
3. Document architecture changes in relevant `.md` files

```
doc/getting-started/running.md:
```
# Running the Agent

## Basic Usage

Start with console output:
```bash
npm start -- --mode console
```

## Web Interface

Start web server:
```bash
npm start -- --mode web
```

Access at `http://localhost:3000`

## WebSocket Mode

Expose WebSocket endpoint:
```bash
npm start -- --mode ws --port 8080
```

```