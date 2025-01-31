# LLM Stream Management

## Stream States

```mermaid
graph TD
  A[Idle] -->|Start prompt| B[Streaming]
  B -->|Interrupt| C[Processing]
  C -->|New prompt| B
  C -->|Terminate| A
```

## Interruption Flow

1. Receive external event (user input, API call)
2. Freeze current stream context
3. Execute priority LLM pipeline:
   - Determine response strategy
   - Update knowledge base
   - Generate new prompt
4. Resume stream with new context
