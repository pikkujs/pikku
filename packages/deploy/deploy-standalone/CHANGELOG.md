# @pikku/deploy-standalone

## 0.12.2

### Patch Changes

- 5c98fd1: Switch standalone deploy from uWebSockets.js to Express + ws

  - Replace PikkuUWSServer with PikkuExpressServer in generated entry
  - Add WebSocket support via ws + pikkuWebsocketHandler
  - Remove pkg binary compilation — ship bundle.js directly
  - Remove native module (uws .node) handling
  - Add loadSchemas: false to avoid global state resolution issues
  - Add getHttpServer() to PikkuExpressServer for ws attachment

## 0.12.1

### Patch Changes

- 9104b68: Switch standalone deploy from uWebSockets.js to Express + ws

  - Replace PikkuUWSServer with PikkuExpressServer in generated entry
  - Add WebSocket support via ws + pikkuWebsocketHandler
  - Remove pkg binary compilation — ship bundle.js directly
  - Remove native module (uws .node) handling
  - Add loadSchemas: false to avoid global state resolution issues
  - Add getHttpServer() to PikkuExpressServer for ws attachment
