import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getServerUrl, setServerUrl } from './serverUrl.js'

class MemoryStorage {
  values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const originalWindow = (globalThis as any).window
const originalLocalStorage = (globalThis as any).localStorage

const installBrowserState = (url: string): MemoryStorage => {
  const storage = new MemoryStorage()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: new URL(url),
    },
  })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  return storage
}

test.afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
  } else {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    })
  }

  if (originalLocalStorage === undefined) {
    Reflect.deleteProperty(globalThis, 'localStorage')
  } else {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    })
  }
})

test('getServerUrl defaults to the current origin in the browser', () => {
  installBrowserState('http://localhost:7071/tests')

  assert.equal(getServerUrl(), 'http://localhost:7071')
})

test('getServerUrl persists the server query parameter after normalizing it', () => {
  const storage = installBrowserState(
    'http://localhost:7071/tests?server=http%3A%2F%2Flocalhost%3A7103%2F'
  )

  assert.equal(getServerUrl(), 'http://localhost:7103')
  assert.equal(storage.getItem('pikku-server-url'), 'http://localhost:7103')
})

test('setServerUrl stores a normalized value that getServerUrl reuses', () => {
  installBrowserState('http://localhost:7071/tests')

  setServerUrl('http://localhost:7103/')

  assert.equal(getServerUrl(), 'http://localhost:7103')
})

test('getServerUrl migrates the legacy localhost:4002 default to the current origin', () => {
  const storage = installBrowserState('http://localhost:7071/tests')
  storage.setItem('pikku-server-url', 'http://localhost:4002')

  assert.equal(getServerUrl(), 'http://localhost:7071')
  assert.equal(storage.getItem('pikku-server-url'), 'http://localhost:7071')
})
