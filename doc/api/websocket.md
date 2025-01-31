# WebSocket API

## Endpoint

`ws://localhost:{port}/stream`

## Message Types

```json
{
  "type": "status",
  "data": {"state": "streaming"}
}
```

```json
{
  "type": "token",
  "data": {"content": "Paris", "complete": false}
}
```

## Error Handling

```json
{
  "type": "error",
  "data": {"message": "LLM timeout"}
}
```
