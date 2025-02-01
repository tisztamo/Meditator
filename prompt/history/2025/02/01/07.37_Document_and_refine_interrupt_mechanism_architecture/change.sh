#!/bin/sh
set -e
goal="Document and refine interrupt mechanism architecture"
echo "Plan:"
echo "1. Create detailed interrupt mechanism documentation"
echo "2. Update stream management documentation"
echo "3. Update main documentation index"

cat > doc/architecture/interrupt-mechanism.md << 'EOF'
# Interrupt Mechanism

The StreamOfConsciousness system employs a sophisticated interrupt mechanism that allows for both internal and external interrupts to manage and control the continuous stream of consciousness. This document details the architecture and implementation of this system.

## Overview

The interrupt mechanism consists of two main components:
1. **Interrupt Generators** - Customizable tasks that can create interrupts based on various conditions
2. **Interrupt Handler** - A central system that processes interrupts through an LLM pipeline

## Interrupt Generators

Interrupt generators are separate tasks that can be customized and implemented by users. They operate independently and can be scheduled to run on various conditions.

### Internal Interrupt Generators

Users can implement internal generators that run on predefined schedules:

1. **Token-Based Generators**
   - Run after every generated token
   - Can analyze the token stream
   - Useful for content monitoring or validation

2. **Time-Based Generators**
   - Run on fixed intervals (e.g., every 10 seconds)
   - Can perform periodic checks or updates
   - Useful for maintenance tasks

3. **Custom Generators**
   - Users can implement their own generators
   - Can access the main knowledge base
   - Maintain private state in separate knowledge bases
   - Can use LLMs to analyze the recent stream

### External Interrupt Sources

External interrupts come from outside the system:

1. **User Inputs**
   - Direct messages or commands
   - Web interface interactions
   - API calls

2. **System Events**
   - File system changes
   - Network events
   - Integration triggers

## Interrupt Structure

Each interrupt is represented as a Markdown document containing:

```markdown
## Interrupt Record
- DateTime: [ISO 8601 timestamp]
- Source: [Internal/External]
- Type: [Specific interrupt type]
- Context:
  - Last Output: [Recent tokens from stream]
  - Stream State: [Current stream state]
- Reason: [Detailed explanation]
- Additional Data: [Any relevant metadata]
```

## Interrupt Handler Pipeline

The central interrupt handler processes all interrupts through an LLM pipeline:

```mermaid
sequenceDiagram
    participant Generator
    participant Handler
    participant LLM
    participant StreamManager
    
    Generator->>Handler: Submit Interrupt
    Handler->>StreamManager: Pause Stream
    Handler->>LLM: Process through Pipeline
    LLM-->>Handler: Response Strategy
    Handler->>StreamManager: Execute Response
    StreamManager->>StreamManager: Resume/Redirect Stream
```

### Handler Processing Steps

1. **Interrupt Reception**
   - Receive interrupt document from generator
   - Validate interrupt structure
   - Capture current stream state

2. **LLM Pipeline**
   - Process interrupt through LLM
   - Analyze context and determine response
   - Generate new prompt if needed

3. **Stream Control**
   - Execute response strategy
   - Resume, redirect, or terminate stream
   - Update knowledge base if necessary

## State Management

### Generator State Storage

Each interrupt generator maintains its own private state:

```
/interrupt-state/
├── token-monitor/
│   ├── state.md
│   └── metadata.json
├── time-based/
│   ├── state.md
│   └── metadata.json
└── custom-generator/
    ├── state.md
    └── metadata.json
```

Generators can:
- Access the main knowledge base
- Maintain private state storage
- Use LLM processing to:
  - Analyze recent output
  - Evaluate context
  - Make decisions about generating interrupts
EOF

cat > doc/architecture/llm-streams.md << 'EOF'
# LLM Stream Management

## Stream States

```mermaid
graph TD
  A[Idle] -->|Start prompt| B[Streaming]
  B -->|Internal Interrupt| C[Monitoring]
  B -->|External Interrupt| D[Processing]
  C -->|Resume| B
  C -->|Escalate| D
  D -->|New prompt| B
  D -->|Terminate| A
```

## Interruption Flow

1. **Generator Activity**
   - External events trigger interrupts
   - Internal generators monitor and create interrupts
   - Interrupts queued for handler

2. **Stream Management**
   - Handler freezes current stream context
   - Save state and metadata
   - Begin LLM pipeline processing

3. **Handler Processing**
   - Execute interrupt-specific LLM pipeline
   - Determine response strategy
   - Update knowledge bases
   - Generate new prompts if needed

4. **Stream Resolution**
   - Resume with new context
   - Redirect to new stream
   - Terminate if necessary

## Integration Points

- Interrupt Generators
- Central Handler
- Stream Controllers
- LLM Processors
EOF

cat > doc/index.md << 'EOF'
# StreamOfConsciousness Documentation

Welcome to the StreamOfConsciousness documentation. This resource covers everything from installation to deep architectural insights.

## Core Sections

- [Getting Started](getting-started/installation.md)
- [Configuration Guide](getting-started/configuration.md)
- [Web Interface](guides/web-interface.md)
- [System Architecture](architecture/knowledge-base.md)
  - [Knowledge Base Structure](architecture/knowledge-base.md)
  - [LLM Streams](architecture/llm-streams.md)
  - [Interrupt Mechanism](architecture/interrupt-mechanism.md)
- [API Reference](api/websocket.md)
- [Contributing Guide](contributing.md)

## For Different Audiences

**End Users**  
Start with [Installation](getting-started/installation.md) and [Running the Agent](getting-started/running.md).

**Developers/Integrators**  
- Begin with [Integration Guide](guides/integration.md) and [API Reference](api/websocket.md)
- For custom interrupt generators, see [Interrupt Mechanism](architecture/interrupt-mechanism.md)

**Maintainers**  
- Review [Architecture Overview](architecture/knowledge-base.md)
- Understand the [Interrupt Mechanism](architecture/interrupt-mechanism.md)
- See [Contributing Guide](contributing.md)

EOF

echo "\033[32mDone: $goal\033[0m\n"