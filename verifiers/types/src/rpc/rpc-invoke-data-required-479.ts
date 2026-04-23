import type { RPCInvoke } from '#pikku/rpc/pikku-rpc-wirings-map.gen.js'

declare const invoke: RPCInvoke

invoke('objectInputRPC', { name: 'ok' })
invoke('optionalInputRPC', {})

// @ts-expect-error non-void RPC input must require data
invoke('objectInputRPC')

// @ts-expect-error optional-object RPC input still requires data argument
invoke('optionalInputRPC')
