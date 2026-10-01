import { after, before, beforeEach } from 'node:test'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import Redis from 'ioredis'
import { defineServiceTests } from '@pikku/core/testing'
import { InMemoryLeaseService } from '@pikku/core/services'

import { RedisWorkflowService } from './redis-workflow-service.js'

const available = spawnSync('redis-server', ['--version']).status === 0

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })

let server: ChildProcess | undefined
let redis: Redis

if (available) {
  before(
    async () => {
      const port = await freePort()
      server = spawn('redis-server', ['--port', String(port), '--save', ''], {
        stdio: 'ignore',
      })
      redis = new Redis({ port, host: '127.0.0.1', lazyConnect: true })
      redis.on('error', () => {})
      for (let attempt = 0; ; attempt++) {
        try {
          await redis.connect()
          return
        } catch (error) {
          if (attempt > 50) throw error
          await new Promise((r) => setTimeout(r, 100))
        }
      }
    },
    { timeout: 30_000 }
  )

  beforeEach(async () => {
    await redis.flushall()
  })

  after(async () => {
    redis.disconnect()
    server?.kill()
  })

  defineServiceTests({
    name: 'redis',
    services: {
      workflowCompensationQueued: async () =>
        new RedisWorkflowService(redis, {
          keyPrefix: 'workflows',
          wireQueues: false,
          leaseService: new InMemoryLeaseService(),
        }),
    },
  })
} else {
  console.warn('redis-server not found: skipping the real-redis workflow suite')
}
