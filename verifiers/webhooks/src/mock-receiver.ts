import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface ReceivedWebhook {
  method: string
  path: string
  headers: Record<string, string | string[] | undefined>
  body: string
}

export interface MockReceiver {
  url: string
  received: ReceivedWebhook[]
  respondWith: (statuses: number[]) => void
  stop: () => Promise<void>
}

export async function startMockReceiver(): Promise<MockReceiver> {
  const received: ReceivedWebhook[] = []
  let pendingStatuses: number[] = []

  const server: Server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      received.push({
        method: req.method ?? '',
        path: req.url ?? '',
        headers: req.headers,
        body,
      })
      const status = pendingStatuses.shift() ?? 200
      res.writeHead(status)
      res.end()
    })
  })

  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve())
  )
  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}/hook`,
    received,
    respondWith: (statuses) => {
      pendingStatuses = [...statuses]
    },
    stop: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  }
}
