import { join, resolve } from 'path'

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
import { LocalEventHubService } from '@pikku/core/channel/local'
import { pikkuWebsocketHandler } from '@pikku/ws'
import { PikkuNodeHTTPServer } from '@pikku/node-http-server'
import { WebSocketServer } from 'ws'
import { InMemorySchedulerService } from '@pikku/schedule'
import { resolveLocalDb, createKysely } from '../db/local-db.js'

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

    const resolvedLocalDb = resolveLocalDb(
      userConfig.dev?.localDb,
      config.rootDir
    )
    const kysely = resolvedLocalDb ? createKysely(resolvedLocalDb) : undefined

    const schedulerService = new InMemorySchedulerService()
    const inMemoryServices = {
      logger: new ConsoleLogger(),
      schedulerService,
      queueService: new InMemoryQueueService(),
      workflowService: new InMemoryWorkflowService(),
      triggerService: new InMemoryTriggerService(),
      aiRunStateService: new InMemoryAIRunStateService(),
      eventHub: new LocalEventHubService(),
      ...(kysely ? { kysely } : {}),
    }

    const singletonServices = await userCreateSingletonServices(
      userConfig,
      inMemoryServices
    )
    pikkuState(null, 'package', 'singletonServices', singletonServices)

    const wss = new WebSocketServer({ noServer: true })
    const pikkuServer = new PikkuNodeHTTPServer(
      { ...userConfig, hostname, port: resolvedPort },
      logger,
      {
        configureServer: (httpServer) => {
          pikkuWebsocketHandler({ server: httpServer, wss, logger })
        },
      }
    )

    await pikkuServer.init()
    await schedulerService.start()
    await pikkuServer.start()

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
        await pikkuServer.stop()
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
