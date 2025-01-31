# WebSocket API

## Endpoint

`ws://localhost:{port}/stream`

## Outgoing Messages

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

## Incoming Messages

```json
{
  "type": "error",
  "data": {"message": "LLM timeout"}
}
```
