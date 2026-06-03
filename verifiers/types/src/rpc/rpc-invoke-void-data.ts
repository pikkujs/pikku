/**
 * Type constraint: RPCInvoke must require data for object inputs and omit it for void inputs
 *
 * - Void-input functions: invoke('name') — no data argument
 * - Object-input functions: invoke('name', {}) — data argument required
 * - Optional-field objects still require the data argument (pass {})
 */

import type { RPCInvoke } from '#pikku/rpc/pikku-rpc-wirings-map.gen.js'

declare const invoke: RPCInvoke

// Valid: void-input function called without data
invoke('voidInputRPC')

// Valid: object-input function called with data
invoke('objectInputRPC', { name: 'test' })

// Valid: optional-field input called with empty object
invoke('optionalInputRPC', {})

// Valid: optional-field input called with data
invoke('optionalInputRPC', { filter: 'test' })

// @ts-expect-error — void-input function should not accept data
invoke('voidInputRPC', {})

// @ts-expect-error — object-input function requires data argument
invoke('objectInputRPC')

// @ts-expect-error — optional-field input still requires data argument (pass {})
invoke('optionalInputRPC')
