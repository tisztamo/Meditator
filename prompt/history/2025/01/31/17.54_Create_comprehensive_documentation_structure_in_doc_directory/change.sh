#!/bin/sh
set -e
goal="Create comprehensive documentation structure in doc/ directory"
echo "Plan:"
echo "1. Create doc directory structure with explicit mkdir commands"
echo "2. Populate core documentation files with content from README and expanded explanations"
echo "3. Ensure documentation covers both end-user and developer use cases"

# Create directory structure with explicit commands
mkdir -p doc
mkdir -p doc/getting-started
mkdir -p doc/guides
mkdir -p doc/architecture
mkdir -p doc/api

# Main index
cat > doc/index.md << EOF
# StreamOfConsciousness Documentation

Welcome to the StreamOfConsciousness documentation. This resource covers everything from installation to deep architectural insights.

## Core Sections

- [Getting Started](getting-started/installation.md)
- [Configuration Guide](getting-started/configuration.md)
- [Web Interface](guides/web-interface.md)
- [System Architecture](architecture/knowledge-base.md)
- [API Reference](api/websocket.md)
- [Contributing Guide](contributing.md)

## For Different Audiences

**End Users**  
Start with [Installation](getting-started/installation.md) and [Running the Agent](getting-started/running.md).

**Developers/Integrators**  
See [Integration Guide](guides/integration.md) and [API Reference](api/websocket.md).

**Maintainers**  
Review [Architecture Overview](architecture/knowledge-base.md) and [Contributing Guide](contributing.md).
EOF

# Getting Started
cat > doc/getting-started/installation.md << EOF
# Installation

## Prerequisites

- Node.js 18+
- npm 9+
- Python 3.8+ (for certain LLM integrations)
  
## Steps

1. Clone repository:
   \`\`\`bash
   git clone https://github.com/yourorg/StreamOfConsciousness.git
   cd StreamOfConsciousness
   \`\`\`

2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Set up environment variables:
   \`\`\`bash
   echo "KNOWLEDGE_BASE_DIR=./knowledge" >> .env
   echo "LLM_PROVIDER=openai" >> .env
   \`\`\`
EOF

cat > doc/getting-started/configuration.md << EOF
# Configuration

## Core Settings

Environment variables in \`.env\`:

\`\`\`
KNOWLEDGE_BASE_DIR=./kb   # Path to knowledge base
LLM_PROVIDER=openai       # LLM service provider
STREAM_TIMEOUT=300        # Seconds before stream timeout
\`\`\`

## LLM Providers

1. **OpenAI**
   - Set API key:
     \`\`\`bash
     echo "OPENAI_API_KEY=your-key" >> .env
     \`\`\`

2. **Local Models**
   - Install required Python packages
   - Update configuration:
     \`\`\`bash
     echo "LLM_ENDPOINT=http://localhost:5000" >> .env
     \`\`\`
EOF

cat > doc/getting-started/running.md << EOF
# Running the Agent

## Basic Usage

Start with console output:
\`\`\`bash
npm start -- --mode console
\`\`\`

## Web Interface

Start web server:
\`\`\`bash
npm start -- --mode web
\`\`\`

Access at \`http://localhost:3000\`

## WebSocket Mode

Expose WebSocket endpoint:
\`\`\`bash
npm start -- --mode ws --port 8080
\`\`\`
EOF

# Guides
cat > doc/guides/web-interface.md << EOF
# Web Interface Guide

## Features

- Real-time stream visualization
- Interactive prompt input
- Knowledge base browser
- Conversation history

## Usage

1. **Stream Display**  
   Shows real-time token output from the agent's current thought stream.

2. **Prompt Input**  
   Interrupt current stream by submitting new prompts:
   \`\`\`text
   [User] > What's the capital of France?
   [System] Stream interrupted... generating response
   \`\`\`

3. **Knowledge Navigation**  
   Use left sidebar to browse stored concepts and metadata.
EOF

cat > doc/guides/integration.md << EOF
# Integration Guide

## As a Component

1. Import agent core:
   \`\`\`javascript
   import { startStream } from 'stream-of-consciousness';
   
   const agent = startStream({
     mode: 'websocket',
     port: 3001
   });
   \`\`\`

2. Handle WebSocket messages:
   \`\`\`javascript
   agent.on('token', (token) => {
     console.log('New token:', token);
   });
   \`\`\`
EOF

# Architecture
cat > doc/architecture/knowledge-base.md << EOF
# Knowledge Base Architecture

## Structure

\`\`\`text
knowledge/
  topic-1/
    index.md          # Main content
    metadata.md       # Free-form English metadata
    subtopic-a.md
  topic-2/
    index.md
    diagram.png.meta  # Image metadata
\`\`\`

## Metadata Handling

Metadata files:
- Always same name as parent file/directory + \`.md\`
- Markdown format for flexible documentation
- Example metadata.md:
  \`\`\`markdown
  ## Context Relations
  - Related to [topic-2](../topic-2/index.md)
  - Created: 2023-10-01
  
  ## Custom Fields
  Importance: high
  \`\`\`
EOF

cat > doc/architecture/llm-streams.md << EOF
# LLM Stream Management

## Stream States

\`\`\`mermaid
graph TD
  A[Idle] -->|Start prompt| B[Streaming]
  B -->|Interrupt| C[Processing]
  C -->|New prompt| B
  C -->|Terminate| A
\`\`\`

## Interruption Flow

1. Receive external event (user input, API call)
2. Freeze current stream context
3. Execute priority LLM pipeline:
   - Determine response strategy
   - Update knowledge base
   - Generate new prompt
4. Resume stream with new context
EOF

# API
cat > doc/api/websocket.md << EOF
# WebSocket API

## Endpoint

\`ws://localhost:{port}/stream\`

## Message Types

\`\`\`json
{
  "type": "status",
  "data": {"state": "streaming"}
}
\`\`\`

\`\`\`json
{
  "type": "token",
  "data": {"content": "Paris", "complete": false}
}
\`\`\`

## Error Handling

\`\`\`json
{
  "type": "error",
  "data": {"message": "LLM timeout"}
}
\`\`\`
EOF

# Supporting docs
cat > doc/contributing.md << EOF
# Contributing

## Development Setup

1. Fork repository
2. Install dev dependencies:
   \`\`\`bash
   npm install -g typescript eslint
   \`\`\`

## Code Style

- TypeScript: Airbnb base + 4 space indent
- Markdown: 80 character line wrap
- Tests: Jest for unit, Playwright for E2E

## Pull Requests

1. Update documentation for new features
2. Include test coverage
3. Document architecture changes in relevant \`.md\` files
EOF

echo "\033[32mDone: $goal\033[0m\n"