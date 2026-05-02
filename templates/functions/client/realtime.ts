import { PikkuFetch } from '../.pikku/pikku-fetch.gen.js'
import { PikkuRealtime } from '../.pikku/pikku-realtime.gen.js'

const TIMEOUT_MS = 10_000

async function runRealtimeTest() {
  console.log('Testing PikkuRealtime (subscribe/publish/unsubscribe)...')

  const serverUrl = process.env.TODO_APP_URL || 'http://localhost:4002'
  console.log('Realtime test against:', serverUrl)

  const fetch = new PikkuFetch()
  fetch.setServerUrl(serverUrl)

  const realtime = new PikkuRealtime()
  realtime.setPikkuFetch(fetch)

  const topic = 'todo-created' as const
  let received: any = null
  let timeoutHandle: NodeJS.Timeout | undefined

  const arrived = new Promise<void>((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new Error(
          `Did not receive an event on '${topic}' within ${TIMEOUT_MS}ms`
        )
      )
    }, TIMEOUT_MS)
    realtime.subscribe(topic as any, (data: unknown) => {
      received = data
      resolve()
    })
  })

  // Give the websocket a moment to connect + the server-side subscribe to land.
  await new Promise((r) => setTimeout(r, 500))

  // Publish via the existing wired RPC/HTTP — we POST a todo, the function
  // is expected to publish on `todo-created` via eventHub.
  const res = await fetch.fetch('/todos', {
    method: 'POST',
    body: JSON.stringify({ title: 'realtime smoke', priority: 'low' }),
    headers: { 'content-type': 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Failed to create todo for realtime test: ${res.status}`)
  }

  await arrived
  if (timeoutHandle) clearTimeout(timeoutHandle)
  console.log('Received realtime event:', received)

  realtime.close()
  console.log('Realtime test completed successfully')
  process.exit(0)
}

runRealtimeTest().catch((err) => {
  console.error('Realtime test failed:', err)
  process.exit(1)
})
