# WebSocket API

## Endpoint

`ws://localhost:7627/stream`

## Outgoing Messages

```json
{
  "type": "status",
  "data": {"state": "streaming", "previousState": "starting", "timestamp": "2023-10-15T12:34:56.789Z"}
}
```

```json
{
  "type": "thought_fragment",
  "data": {"content": "Paris", "complete": false}
}
```

## Incoming Messages

```json
{
  "type": "input",
  "data": {"message": "Where is the Eiffel Tower?"}
}
```

