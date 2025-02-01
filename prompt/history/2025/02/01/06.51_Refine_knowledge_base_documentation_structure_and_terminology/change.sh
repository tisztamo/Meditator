#!/bin/sh
set -e
goal="Refine knowledge base documentation structure and terminology"
echo "Plan:"
echo "1. Update knowledge-base.md with new terminology and structure"
echo "2. Modify README.md architecture overview section"
echo "3. Remove old metadata references and ensure consistency"

# Update knowledge-base.md
cat > doc/architecture/knowledge-base.md << EOF
# Knowledge Base Architecture

## Definitions

- **Abstraction**: A directory (or subdirectory) that groups related Topics. Abstractions provide a structured way to organize knowledge hierarchically. Each Abstraction contains an \`index.md\` file describing its purpose and links to its Topics.

- **Atom**: A normal Markdown file that represents a single, self-contained piece of knowledge. Atoms are the atomic units of information within the knowledge base.

- **Topic**: A collective term referring to both Abstractions and Atoms. Topics are the building blocks of the knowledge base's structure.

## Structure

The knowledge base follows a hierarchical directory structure where Abstractions (directories) organize related Topics, and Atoms (Markdown files) store individual knowledge units. Metadata for each Topic is stored in separate \`.meta.md\` files.

\`\`\`text
knowledge/
  abstraction-1/
    index.md          # Title, description, and links to subtopics
    index.meta.md     # Metadata for this Abstraction
    atom-a.md         # Content of the Atom
    atom-a.meta.md    # Metadata for atom-a.md
  abstraction-2/
    index.md
    index.meta.md
    image.png         # Non-Atom file
    image.png.meta.md # Metadata for image.png
\`\`\`

## Metadata Handling

Metadata for Abstractions and Atoms is stored in separate Markdown files with a \`.meta.md\` suffix. This approach keeps content and metadata decoupled while maintaining a human-readable format.

### Abstraction Metadata
Each Abstraction (directory) contains an \`index.meta.md\` file. This file holds metadata about the Abstraction itself, such as its relationships to other Topics, creation date, or custom fields.

**Example \`index.meta.md\` for an Abstraction:**
\`\`\`markdown
## Context Relations
- Related to [abstraction-2](../abstraction-2/index.md)
- Created: 2023-10-01

## Custom Fields
Importance: high
\`\`\`

### Atom Metadata
Every Atom (Markdown file) can have a corresponding \`<filename>.meta.md\` file. This metadata might include summaries, tags, or connections to other Topics.

**Example \`atom-a.meta.md\`:**
\`\`\`markdown
## Summary
This Atom explores the core principles of...

## Associations
- Supports [abstraction-1](../abstraction-1/index.md)
- Reference: [External Resource](https://example.com)
\`\`\`

### General Guidelines
- Metadata files use standard Markdown formatting for maximum flexibility.
- The structure of metadata can evolve organically based on project needs.
- All metadata files are optional but recommended for enhanced context understanding.

## Index Files

Every Abstraction directory must contain an \`index.md\` file that serves as the entry point for that Abstraction. The \`index.md\` should include:

1. **One-line Title**: Clear and concise name of the Abstraction.
2. **Paragraph Description**: Brief overview (2-5 sentences) explaining the Abstraction's purpose and scope.
3. **Topic Links**: List of relevant sub-Abstractions (directories) and Atoms (files) within this Abstraction. Each link should have a short descriptor explaining its relation to the parent Abstraction.

**Example \`index.md\` for an Abstraction:**
\`\`\`markdown
# Core Concepts

This Abstraction covers fundamental principles that form the foundation of our system architecture.

## Sub-Abstractions
- [Design Patterns](./design-patterns/): Common solutions to recurring problems
- [Data Structures](./data-structures/): Organization and storage formats

## Atoms
- [Encapsulation](./encapsulation.md): Isolation of component internals
- [Polymorphism](./polymorphism.md): Interface flexibility patterns
\`\`\`
EOF

# Update README.md architecture overview section
cat > README.md << EOF
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
   - Each Abstraction contains an \`index.md\` with a title, description, and links to related Topics. Metadata is stored in \`index.meta.md\`.  
   - Atoms represent individual knowledge units with optional \`<atom>.meta.md\` files for metadata.  
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
     \`\`\`bash
     npm install
     \`\`\`
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

Thank you for using **StreamOfConsciousness**. We hope it enhances your AI development experience with continuous, long-term context and a truly streaming flow of thoughts!

**Note**: This project was developed using [AI Junior](https://aijunior.dev).
EOF

echo "\033[32mDone: $goal\033[0m\n"