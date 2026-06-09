import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isConsoleRpcName, pikku, toWebsocketUrl } from './http.js'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1

  readyState = 0
  sent: string[] = []
  private listeners = new Map<string, Set<(event: any) => void>>()
  onopen: ((event: any) => void) | null = null
  onmessage: ((event: any) => void) | null = null
  onerror: ((event: any) => void) | null = null
  onclose: ((event: any) => void) | null = null

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN
      this.dispatch('open', {})
    })
  }

  addEventListener(
    type: string,
    listener: (event: any) => void,
    options?: { once?: boolean }
  ) {
    const listeners =
      this.listeners.get(type) ?? new Set<(event: any) => void>()
    const wrapped = options?.once
      ? (event: any) => {
          this.removeEventListener(type, wrapped)
          listener(event)
        }
      : listener
    listeners.add(wrapped)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    this.listeners.get(type)?.delete(listener)
  }

  send(data: string) {
    this.sent.push(data)
    queueMicrotask(() => {
      const parsed = JSON.parse(data) as { action?: string }
      this.dispatch('message', {
        data: JSON.stringify({ action: parsed.action, ok: true }),
      })
    })
  }

  close() {
    this.readyState = 3
    this.dispatch('close', {})
  }

  private dispatch(type: string, event: any) {
    const handler = this[`on${type}` as keyof this] as
      | ((event: any) => void)
      | null
    handler?.(event)
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }
}

test('console websocket helpers map console RPCs to websocket transport', async () => {
  const previousWebSocket = globalThis.WebSocket
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket

  try {
    assert.equal(
      toWebsocketUrl('https://example.com/api'),
      'wss://example.com/api/ws/console'
    )
    assert.equal(isConsoleRpcName('console:getAllMeta'), true)
    assert.equal(isConsoleRpcName('pikkuConsoleGetSecret'), true)
    assert.equal(isConsoleRpcName('workflow:run'), false)

    const client = pikku({ serverUrl: 'https://example.com/api' })
    const result = await client.rpc.invoke('console:getAllMeta')

    assert.deepEqual(result, { ok: true })
    assert.equal(FakeWebSocket.instances.length, 1)
    assert.equal(
      FakeWebSocket.instances[0].url,
      'wss://example.com/api/ws/console'
    )
    assert.deepEqual(JSON.parse(FakeWebSocket.instances[0].sent[0]), {
      action: 'getAllMeta',
    })
  } finally {
    globalThis.WebSocket = previousWebSocket
  }
})
