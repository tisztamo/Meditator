#!/bin/sh
set -e
goal="Improve documentation with metadata details and AI Junior note"
echo "Plan:"
echo "1. Update Features section with metadata structure and customization info."
echo "2. Add Development Note section acknowledging AI Junior usage."

cat > ./README.md << EOF
# StreamOfConsciousness

**StreamOfConsciousness** is an AI agent designed to maintain a persistent state in the form of a knowledge base. The knowledge base is stored as a directory structure containing Markdown files and associated metadata. Using this data store, the agent continuously executes streaming calls to Large Language Models (LLMs), generating a flowing "stream of consciousness." When an external event occurs—such as an incoming user prompt, a web API call, a tool invocation, or a periodic timeout—the ongoing stream of consciousness is interrupted, and a new set of non-streamed LLM calls determines the next prompt and resumes the stream of consciousness.

## Features

- **Stateful Knowledge Base**  
  A tree of Markdown and metadata files keeps track of the agent’s accumulated knowledge. Metadata is stored as English prose in Markdown format, following a flexible structure that can evolve over time. Default metadata templates are provided, but users can customize the structure by adding a configuration prompt file to their repository. This allows for tailored organization and additional context as needed.  
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
   - Directory structure with Markdown files and metadata.  
   - The agent reads from and writes to this filesystem to maintain long-term context.  

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

1. **Fork the Repo**  
   - Clone your own copy of the repository and create feature branches for your changes.  
2. **Code Guidelines**  
   - Maintain clarity in code and comments.  
   - Ensure thorough documentation and tests for new features or bug fixes.  
3. **Pull Requests**  
   - Push a branch to your fork and open a Pull Request describing your changes in detail.  
   - Project maintainers will review and merge upon approval.

## License

This project is available under the MIT License. See [LICENSE](./LICENSE) for details.

## Support

- For questions, suggestions, or issues, please open an [Issue](../../issues).  
- Feel free to submit pull requests to improve or expand functionality.

## Development Note

This project was developed with the assistance of [AI Junior](https://aijunior.dev), an AI-powered development tool that accelerates software creation through intelligent automation and guidance.

Thank you for using **StreamOfConsciousness**. We hope it enhances your AI development experience with continuous, long-term context and a truly streaming flow of thoughts!
EOF

echo "\033[32mDone: $goal\033[0m\n"