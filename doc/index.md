# Meditator Documentation

Welcome to the Meditator documentation. This resource covers everything from installation to deep architectural insights.

## Core Sections

- [Getting Started](getting-started/installation.md)
- [Configuration Guide](getting-started/configuration.md)
- [Web Interface](guides/web-interface.md)
- [System Architecture](architecture/index.md)
  - [Knowledge Base Structure](architecture/knowledge-base.md)
  - [LLM Streams](architecture/llm-streams.md)
  - [Interrupt Mechanism](architecture/interrupt-mechanism.md)
  - [Tools Components](tools-components.md)
- [API Reference](api/websocket.md)
- [Contributing Guide](contributing.md)

## For Different Audiences

### End Users  
Start with the basics:
- [Installation](getting-started/installation.md)
- [Running the Agent](getting-started/running.md)
- [Interacting with Meditator](guides/interaction.md)
- [Basic Configuration](getting-started/configuration.md)

### Developers & Integrators  
Understand the API and extension points:
- [Integration Guide](guides/integration.md)
- [API Reference](api/websocket.md)
- [Custom Interrupt Generators](architecture/interrupt-mechanism.md#interrupt-generators)
- [Knowledge Base Integration](architecture/knowledge-base.md#state-management-integration)
- [Tool Component Development](tools-components.md)

### System Maintainers  
Dive deep into architecture:
- [Knowledge Base Architecture](architecture/knowledge-base.md)
- [Interrupt Mechanism](architecture/interrupt-mechanism.md)
- [LLM Stream Management](architecture/llm-streams.md)
- [State Persistence System](architecture/knowledge-base.md#state-chain-system)
- [Tools System](tools-components.md)
- [Contributing Guidelines](contributing.md)

## Key Components

- **Mind (`mMind`)**: Core component that handles interrupts and manages thought flow
- **Stream (`mStream`)**: Manages the continuous stream of text from the LLM
- **Interrupts (`mInterrupts`)**: Processes interrupt events through the multi-stage pipeline
- **Tools (`mTools`)**: Manages tool execution and integration with the stream
- **Shell (`mShell`)**: Provides shell command execution capabilities
- **Token Monitor (`mTokenMonitor`)**: Analyzes token stream for patterns requiring interrupts
- **Timeout (`mTimeout`)**: Generates time-based interrupts based on configured intervals

## System Features

- **Continuous Stream of Consciousness**: Real-time streaming text generation
- **Structured Interrupt Handling**: Sophisticated multi-stage pipeline for interrupts
- **State Management**: Persistent storage with partial/full state chain system
- **Declarative Configuration**: HTML-like syntax for defining agent behavior
- **Component Architecture**: Modular design with pub/sub communication
- **Tool Integration**: Built-in support for tool calls, including shell command execution

