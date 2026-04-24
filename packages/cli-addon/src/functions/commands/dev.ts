import { createServer, type ServerResponse, type IncomingMessage } from 'http'
import { join, resolve } from 'path'
import { Readable } from 'stream'

import { pikkuSessionlessFunc } from '#pikku'
import chokidar, { type FSWatcher } from 'chokidar'
import { pikkuDevReloader } from '@pikku/core/dev'
import {
  ConsoleLogger,
  InMemoryQueueService,
  InMemoryWorkflowService,
  InMemoryTriggerService,
  InMemoryAIRunStateService,
} from '@pikku/core/services'
import { stopSingletonServices } from '@pikku/core'
import { pikkuState } from '@pikku/core/internal'
import { fetchData, PikkuFetchHTTPResponse, logRoutes } from '@pikku/core/http'
import { compileAllSchemas } from '@pikku/core/schema'
import { pikkuWebsocketHandler } from '@pikku/ws'
import { WebSocketServer } from 'ws'
import { InMemorySchedulerService } from '@pikku/schedule'

function incomingMessageToRequest(req: IncomingMessage): Request {
  const url = new URL(req.url || '/', 'http://localhost')
  const method = req.method ? req.method.toUpperCase() : 'GET'
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
  }

  let body: BodyInit | null = null
  if (method !== 'GET' && method !== 'HEAD') {
    body = Readable.toWeb(req) as unknown as BodyInit
  }

  return new Request(url.toString(), {
    method,
    headers,
    body,
    // @ts-ignore - duplex is needed for streaming body in Node.js
    duplex: 'half',
  })
}

async function writeResponse(
  nodeRes: ServerResponse,
  webResponse: Response
): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  webResponse.headers.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (lower === 'set-cookie') {
      const existing = headers[lower]
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        headers[lower] = [value]
      }
    } else {
      headers[lower] = value
    }
  })

  nodeRes.writeHead(webResponse.status, headers)

  if (webResponse.body) {
    const reader = webResponse.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        nodeRes.write(value)
      }
    } finally {
      reader.releaseLock()
    }
  }

  nodeRes.end()
}

export const dev = pikkuSessionlessFunc<
  { port?: string; watch?: boolean; hmr?: boolean },
  void
>({
  remote: true,
  func: async (
    { logger, config, getInspectorState },
    { port, watch, hmr },
    { rpc }
  ) => {
    const resolvedPort = parseInt(port || '3000', 10)
    const hostname = 'localhost'
    const enableWatch = watch !== false
    const enableHmr = hmr !== false

    await rpc.invoke('all')

    const inspectorState = await getInspectorState(true)
    const { pikkuConfigFactory, singletonServicesFactory } =
      inspectorState.filesAndMethods

    if (!pikkuConfigFactory || !singletonServicesFactory) {
      logger.error(
        'createConfig and createSingletonServices must be defined in your project'
      )
      return
    }

    const pikkuDir = resolve(config.rootDir, config.outDir)
    const bootstrapPath = join(pikkuDir, 'pikku-bootstrap.gen.js')
    await import(bootstrapPath)

    const configModule = await import(pikkuConfigFactory.file)
    const servicesModule = await import(singletonServicesFactory.file)
    const userCreateConfig = configModule[pikkuConfigFactory.variable]
    const userCreateSingletonServices =
      servicesModule[singletonServicesFactory.variable]

    const userConfig = await userCreateConfig()

    const schedulerService = new InMemorySchedulerService()
    const inMemoryServices = {
      logger: new ConsoleLogger(),
      schedulerService,
      queueService: new InMemoryQueueService(),
      workflowService: new InMemoryWorkflowService(),
      triggerService: new InMemoryTriggerService(),
      aiRunStateService: new InMemoryAIRunStateService(),
    }

    const singletonServices = await userCreateSingletonServices(
      userConfig,
      inMemoryServices
    )
    pikkuState(null, 'package', 'singletonServices', singletonServices)

    compileAllSchemas(logger)
    logRoutes(logger)

    const server = createServer(async (req, res) => {
      const request = incomingMessageToRequest(req)
      const pikkuResponse = new PikkuFetchHTTPResponse()
      await fetchData(request, pikkuResponse, { respondWith404: true })
      const response = pikkuResponse.toResponse()
      await writeResponse(res, response)
    })

    const wss = new WebSocketServer({ noServer: true })
    pikkuWebsocketHandler({ server, wss, logger })

    await schedulerService.start()

    await new Promise<void>((resolve) => {
      server.listen(resolvedPort, hostname, () => {
        logger.info(`Dev server running at http://${hostname}:${resolvedPort}`)
        resolve()
      })
    })

    let configWatcher: FSWatcher | undefined
    let watcher: FSWatcher | undefined

    process.once('SIGINT', async () => {
      logger.info('Stopping dev server...')
      try {
        await stopSingletonServices()
        await configWatcher?.close()
        await watcher?.close()
        await new Promise<void>((resolve, reject) =>
          wss.close((err) => (err ? reject(err) : resolve()))
        )
        await new Promise<void>((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve()))
        )
      } finally {
        process.exit(0)
      }
    })

    if (enableHmr) {
      await pikkuDevReloader({
        srcDirectories: config.srcDirectories,
        logger,
      })
    }

    if (enableWatch) {
      const genIgnore = /\.gen\.tsx?$/

      configWatcher = chokidar.watch(config.srcDirectories, {
        ignoreInitial: true,
        ignored: genIgnore,
      })

      const generatorWatcher = () => {
        watcher?.close()

        logger.info(
          `• Watching directories: \n  - ${config.srcDirectories.join('\n  - ')}`
        )
        watcher = chokidar.watch(config.srcDirectories, {
          ignoreInitial: true,
          ignored: genIgnore,
        })

        watcher.on('ready', async () => {
          const handle = async () => {
            try {
              const start = Date.now()
              await rpc.invoke('all')
              logger.info({
                message: `✓ Generated in ${Date.now() - start}ms`,
                type: 'timing',
              })
            } catch (err) {
              logger.error(`Error running watch: ${err}`)
            }
          }

          await handle()

          let timeout: ReturnType<typeof setTimeout> | undefined

          const deduped = (_file: string) => {
            if (timeout) {
              clearTimeout(timeout)
            }
            timeout = setTimeout(handle, 10)
          }

          watcher?.on('change', deduped)
          watcher?.on('add', deduped)
          watcher?.on('unlink', deduped)
        })
      }

      configWatcher.on('ready', generatorWatcher)
      configWatcher.on('change', generatorWatcher)
    }

    await new Promise(() => {})
  },
})
