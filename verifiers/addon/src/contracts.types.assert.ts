/**
 * Compile-time proof that addon routes keep their real types in the generated
 * client maps — not the `unknown` fallback. Type-only; emits no runtime code.
 * If any addon type resolved to `unknown`/`any`, the conditional below widens
 * away from `true` and `Expect<...>` fails to compile.
 */
import type { HTTPWiringsMap } from '#pikku/http/pikku-http-wirings-map.gen.d.js'
import type { ChannelsMap } from '#pikku/channel/pikku-channels-map.gen.d.js'
import { pikkuFetch } from '#pikku/pikku-fetch.gen.js'
import { PikkuWebSocket } from '#pikku/pikku-websocket.gen.js'

type Expect<T extends true> = T

type AddonHttpInput = HTTPWiringsMap['/api/ext/hello']['GET']['input']
type AddonHttpOutput = HTTPWiringsMap['/api/ext/hello']['GET']['output']
type AddonChannelInput =
  ChannelsMap['ext-events']['routes']['action']['hello']['input']
type AddonChannelOutput =
  ChannelsMap['ext-events']['routes']['action']['hello']['output']

type _HttpInputTyped = Expect<
  AddonHttpInput extends { name: string } ? true : false
>
type _HttpOutputTyped = Expect<
  AddonHttpOutput extends { message: string } ? true : false
>
type _ChannelInputTyped = Expect<
  AddonChannelInput extends { name: string } ? true : false
>
type _ChannelOutputTyped = Expect<
  AddonChannelOutput extends { message: string } ? true : false
>

export type {
  _HttpInputTyped,
  _HttpOutputTyped,
  _ChannelInputTyped,
  _ChannelOutputTyped,
}

/**
 * End-to-end proof that the generated fetch client itself (not just the map it
 * reads) compiles against an addon route with real input/output types. Never
 * executed — tsc type-checks it. If the addon route resolved to `unknown`, the
 * `string` assignment from `res.message` would fail.
 */
export async function _proveFetchClientTypes() {
  const res = await pikkuFetch.get('/api/ext/hello', { name: 'addon' })
  const message: string = res.message
  return message
}

/**
 * End-to-end proof that the generated websocket client compiles against an
 * addon channel action with real input/output types.
 */
export function _proveWebsocketClientTypes(ws: WebSocket) {
  const socket = new PikkuWebSocket<'ext-events'>(ws)
  const action = socket.getRoute('action')
  action.send('hello', { name: 'addon' })
  action.subscribe('hello', (data) => {
    const message: string = data.message
    return message
  })
}
