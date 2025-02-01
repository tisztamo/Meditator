#!/bin/sh
set -e
goal="Update interrupt mechanism documentation with .meta.md files"
echo "Plan:"
echo "1. Update interrupt-mechanism.md to use .meta.md instead of .json"
echo "2. Keep all other previous corrections"

cat > doc/architecture/interrupt-mechanism.md << 'EOF'
# Interrupt Mechanism

The StreamOfConsciousness system employs a sophisticated interrupt mechanism that handles both internal and external interrupts to manage and control the continuous stream of consciousness. All interrupts are processed through the same central handling pipeline. This document details the architecture and implementation of this system.

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

Both token-based and time-based generators can be customized with user-defined logic and behaviors while maintaining their core timing characteristics.

### External Interrupt Sources

External interrupts come from outside the system:

- Direct messages or commands
- Web interface interactions
- API calls

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
│   └── state.meta.md
├── time-based/
│   ├── state.md
│   └── state.meta.md
└── custom-generator/
    ├── state.md
    └── state.meta.md
```

Generators can:
- Access the main knowledge base
- Maintain private state storage
- Use LLM processing to:
  - Analyze recent output
  - Evaluate context
  - Make decisions about generating interrupts
EOF

echo "\033[32mDone: $goal\033[0m\n"