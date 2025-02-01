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
  "type": "thought fragment",
  "data": {"content": "Paris", "complete": false}
}
```

## Incoming Messages

```json
{
  "type": "input prompt",
  "data": {"message": "Where is the Eiffel Tower?"}
}
```

