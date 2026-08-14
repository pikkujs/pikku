---
'@pikku/ws': patch
'@pikku/cli': patch
'@pikku/deploy-standalone': patch
---

fix(ws): cap the frame size every Pikku-owned WebSocketServer accepts

`ws` defaults `maxPayload` to 100MB, and every `WebSocketServer` Pikku
constructed omitted the option — so each one inherited that ceiling. A single
unauthenticated upgrade could make the process buffer a 100MB frame, which no
Pikku message needs: the channel protocol carries JSON control frames, not bulk
payloads.

`@pikku/ws` now exports `DEFAULT_WS_MAX_PAYLOAD` (1MB), and the servers Pikku
owns are constructed with it — the `pikku dev` / `pikku serve` runner, the entry
`@pikku/deploy-standalone` emits, and the `ws` template. Refusal is already
defined by the protocol, so an oversized frame is closed with 1009 (message too
big) rather than buffered.

A server that genuinely needs to accept a larger frame now has to set
`maxPayload` explicitly at its construction site. `yarn check:ws-max-payload`
enforces that, so a new server cannot silently fall back to the 100MB default.
