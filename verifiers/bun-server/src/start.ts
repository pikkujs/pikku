import WebSocket from 'ws'

import { PikkuBunServer } from '@pikku/bun-server'
import { createConfig, createSingletonServices } from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'

const PORT = 7979

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

  console.log('\n--- WebSocket ---')

  await runTest(
    'WS connect triggers onConnect with { connected: true }',
    async () => {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${PORT}/ws/echo`)
        const timeout = setTimeout(
          () => reject(new Error('WebSocket onConnect timeout (5s)')),
          5000
        )
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
