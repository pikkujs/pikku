import { connect } from 'node:net'
import WebSocket from 'ws'

import { PikkuBunServer } from '@pikku/bun-server'
import { LocalVariablesService } from '@pikku/core/services'
import { createConfig, createSingletonServices } from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'

const PORT = Number(new LocalVariablesService().get('PORT') ?? 7979)

interface TestResult {
  name: string
  passed: boolean
  error?: string
}

const results: TestResult[] = []

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    results.push({ name, passed: true })
    console.log(`  ✓ ${name}`)
  } catch (e: any) {
    results.push({ name, passed: false, error: e.message })
    console.log(`  ✗ ${name}: ${e.message}`)
  }
}

async function main(): Promise<void> {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)

  const server = new PikkuBunServer(
    { ...config, port: PORT, hostname: 'localhost' },
    singletonServices.logger
  )
  await server.init()
  await server.start()

  console.log('\nBun Server Verifier')
  console.log('===================')

  console.log('\n--- HTTP ---')

  await runTest('GET /api/greet returns greeting', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/greet?name=World`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { message: string }
    if (body.message !== 'Hello, World!')
      throw new Error(`Expected "Hello, World!" got "${body.message}"`)
  })

  await runTest('Unknown route returns 404', async () => {
    const res = await fetch(`http://localhost:${PORT}/not/found`)
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`)
  })

  console.log('\n--- HTTP request bodies ---')

  const post = (body: BodyInit, headers: Record<string, string> = {}) =>
    fetch(`http://localhost:${PORT}/api/echo-body`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    })

  await runTest('POST with a content-length body is read', async () => {
    const res = await post(JSON.stringify({ text: 'héllo ✓' }))
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { text: string }
    if (body.text !== 'héllo ✓') throw new Error(`Got ${JSON.stringify(body)}`)
  })

  await runTest('POST with a chunked body is read', async () => {
    const encoder = new TextEncoder()
    const res = await fetch(`http://localhost:${PORT}/api/echo-body`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"text":'))
          controller.enqueue(encoder.encode('"chunked"}'))
          controller.close()
        },
      }),
      duplex: 'half',
    } as RequestInit)
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { text: string }
    if (body.text !== 'chunked') throw new Error(`Got ${JSON.stringify(body)}`)
  })

  await runTest('POST over the body limit is refused with 413', async () => {
    const res = await post(
      JSON.stringify({ text: 'x'.repeat(11 * 1024 * 1024) })
    )
    if (res.status !== 413) throw new Error(`Expected 413, got ${res.status}`)
  })

  await runTest(
    'a content-length shorter than the body reads only its length',
    async () => {
      const payload = '{"text":"abc"}'
      const raw = `POST /api/echo-body HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: ${payload.length}\r\nConnection: close\r\n\r\n${payload}GET /smuggled HTTP/1.1\r\nHost: localhost\r\n\r\n`
      const first = await new Promise<string>((resolve, reject) => {
        const socket = connect(PORT, 'localhost')
        let received = ''
        socket.on('connect', () => socket.write(raw))
        socket.on('data', (chunk) => {
          received += chunk.toString()
          if (received.includes('\r\n\r\n') && received.includes('abc')) {
            socket.destroy()
            resolve(received)
          }
        })
        socket.on('error', reject)
        socket.on('close', () => resolve(received))
      })
      if (!first.startsWith('HTTP/1.1 200') || !first.includes('"abc"'))
        throw new Error(`Unexpected response: ${first.slice(0, 200)}`)
    }
  )

  await runTest(
    'a non-numeric content-length never reaches the function',
    async () => {
      const raw =
        'POST /api/echo-body HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 0x7\r\nConnection: close\r\n\r\n{"text":"x"}'
      const received = await new Promise<string>((resolve) => {
        const socket = connect(PORT, 'localhost')
        let data = ''
        socket.on('connect', () => socket.write(raw))
        socket.on('data', (chunk) => (data += chunk.toString()))
        socket.on('error', () => resolve(data))
        socket.on('close', () => resolve(data))
        setTimeout(() => {
          socket.destroy()
          resolve(data)
        }, 3000)
      })
      if (received.startsWith('HTTP/1.1 200'))
        throw new Error(
          `A malformed content-length was served: ${received.slice(0, 120)}`
        )
    }
  )

  console.log('\n--- WebSocket ---')

  await runTest(
    'WS connect triggers onConnect with { connected: true }',
    async () => {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${PORT}/ws/echo`)
        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error('WebSocket onConnect timeout (5s)'))
        }, 5000)
        ws.on('message', (raw) => {
          clearTimeout(timeout)
          try {
            const data = JSON.parse(raw.toString()) as { connected: boolean }
            if (data.connected !== true)
              throw new Error(`Expected { connected: true }, got ${raw}`)
            ws.close()
            resolve()
          } catch (e) {
            ws.close()
            reject(e)
          }
        })
        ws.on('error', (e) => {
          clearTimeout(timeout)
          ws.close()
          reject(e)
        })
      })
    }
  )

  await server.stop()

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  console.log(`\n${'─'.repeat(40)}`)
  console.log(
    `Results: ${passed} passed, ${failed} failed, ${results.length} total`
  )

  if (failed > 0) {
    console.log('\nFailed tests:')
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ✗ ${r.name}: ${r.error}`)
    }
    console.log('\n✗ Some bun-server tests failed!')
    process.exit(1)
  } else {
    console.log('\n✓ All bun-server tests passed!')
  }
}

main().catch((e) => {
  console.error('\n✗ Fatal error:', e.message)
  console.error(e.stack)
  process.exit(1)
})
