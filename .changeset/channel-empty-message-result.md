---
'@pikku/core': patch
---

A channel message handler that returns nothing no longer tries to send it.

`local-channel-runner` sent the message handler's result unconditionally, so a
handler with nothing to say produced `send requires a non-empty message` on every
inbound message. The connect path directly above it has always guarded this; the
message path did not.

Gateway websockets hit it every time — `wireGateway` generates a message handler
that returns `undefined` by design — which showed up as a chat gateway accepting
a connection and then erroring on each message rather than delivering it.

Found while testing a webchat gateway in a template. Note that fixing this is
necessary but not sufficient for that case: codegen does not emit the channel a
websocket gateway registers, so route resolution finds no handler and falls back
to the empty inline `onMessage` the gateway wires as a placeholder. That gap is
still open.
