# Meditator Tools Architecture Examples

> **Historical / deprecated.** Tools and shell execution are explicitly deprioritized — no working mind uses them. These examples and the components they exercise (`m-tools`, `m-shell`) are kept under `architecture/legacy/` for reference only; they are not part of the current system. See [`../../doc/architecture/components.md`](../../doc/architecture/components.md) for component status.

These are archml (`.archml`) configuration examples for the now-deprecated tools system.

## Overview

The tools system in Meditator allows the AI agent to execute operations in the host environment, such as running shell commands. The system is built around two main components:

1. **m-tools**: Manages tool execution and integration with the stream
2. **m-shell**: Provides shell command execution capabilities

## Examples

### Basic Configuration (`tools-basic.archml`)

A simple example showing how to set up a basic tools system with a shell command executor. This is the minimum configuration needed to give an agent shell access.

### Advanced Configuration (`tools-advanced.archml`)

A more sophisticated setup with custom tool prefix, specific shell configuration, and integration with WebSocket and token monitoring components.

### Integration Example (`tools-integration.archml`)

Demonstrates how tools integrate with other Meditator components like knowledge bases, token monitors, and interrupt systems to create a complete research assistant agent.

## Usage

To use these configurations:

1. Copy the desired `.archml` example to your project
2. Adjust parameters as needed (working directories, timeout values, etc.)
3. Include in your Meditator setup

## Tool Call Format

The LLM can invoke tools using a simple text format:

```
Use tool: [tool name]
[command or content to process]
```

For example, with the shell tool:

```
Use tool: shell
ls -la
```

The result from the tool execution will be returned to the agent as an interrupt, allowing it to process the output and determine next steps. 
