import { pikkuSessionlessFunc } from '#pikku'
import chokidar from 'chokidar'
import { pikkuDevReloader } from '@pikku/core/dev'

export const watch = pikkuSessionlessFunc<{ hmr?: boolean }, void>({
  remote: true,
  func: async ({ logger, config, invalidateInspectorState }, { hmr }, { rpc }) => {
    const watchDirectories = [
      ...new Set([config.emailTemplatesDir, ...config.srcDirectories].filter(Boolean)),
    ] as string[]

    if (hmr) {
      await pikkuDevReloader({
        srcDirectories: watchDirectories,
        logger,
      })
    }

    const configWatcher = chokidar.watch(watchDirectories, {
      ignoreInitial: true,
      ignored: /.*\.gen\.tsx?/,
    })

    let watcher = new chokidar.FSWatcher({})

    const generatorWatcher = () => {
      watcher.close()

      logger.info(`• Watching directories: \n  - ${watchDirectories.join('\n  - ')}`)
      watcher = chokidar.watch(watchDirectories, {
        ignoreInitial: true,
        ignored: /.*\.gen\.ts/,
      })

      watcher.on('ready', async () => {
        const handle = async () => {
          try {
            const start = Date.now()
            invalidateInspectorState()
            await rpc.invoke('all')
            logger.info({
              message: `✓ Generated in ${Date.now() - start}ms`,
              type: 'timing',
            })
          } catch (err) {
            console.error(err)
            logger.error('Error running watch')
          }
        }

        await handle()

        let timeout: ReturnType<typeof setTimeout> | undefined

        const deduped = (_file: string) => {
          if (timeout) {
            clearTimeout(timeout)
          }
          timeout = setTimeout(handle, 1000)
        }

        watcher.on('change', deduped)
        watcher.on('add', deduped)
        watcher.on('unlink', deduped)
      })
    }

    configWatcher.on('ready', generatorWatcher)
    configWatcher.on('change', generatorWatcher)
  },
})
