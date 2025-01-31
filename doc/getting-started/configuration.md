# Configuration

## Core Settings

Environment variables in `.env`:

```
KNOWLEDGE_BASE_DIR=./kb   # Path to knowledge base
LLM_PROVIDER=openai       # LLM service provider
STREAM_TIMEOUT=300        # Seconds before stream timeout
```

## LLM Providers

1. **OpenAI**
   - Set API key:
     ```bash
     echo "OPENAI_API_KEY=your-key" >> .env
     ```

2. **Local Models**
   - Install required Python packages
   - Update configuration:
     ```bash
     echo "LLM_ENDPOINT=http://localhost:5000" >> .env
     ```
