# Integration Guide

## As a Component

1. Import agent core:
   ```javascript
   import { startStream } from 'stream-of-consciousness';
   
   const agent = startStream({
     mode: 'websocket',
     port: 3001
   });
   ```

2. Handle WebSocket messages:
   ```javascript
   agent.on('token', (token) => {
     console.log('New token:', token);
   });
   ```
