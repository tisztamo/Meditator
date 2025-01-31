#!/bin/sh
set -e
goal="Update websocket documentation with correct message directions"
echo "Plan:"
echo "1. Rename 'Message Types' section to 'Outgoing Messages'"
echo "2. Rename 'Error Handling' section to 'Incoming Messages'"
echo "3. Ensure error example is under Incoming Messages"

# Update the websocket.md file with corrected section names
cat > doc/api/websocket.md << EOF
# WebSocket API

## Endpoint

\`ws://localhost:{port}/stream\`

## Outgoing Messages

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

## Incoming Messages

\`\`\`json
{
  "type": "error",
  "data": {"message": "LLM timeout"}
}
\`\`\`
EOF

echo "\033[32mDone: $goal\033[0m\n"