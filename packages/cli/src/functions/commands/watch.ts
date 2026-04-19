import { pikkuSessionlessFunc } from '#pikku'
import chokidar from 'chokidar'
import { pikkuDevReloader } from '@pikku/core/dev'

export const watch = pikkuSessionlessFunc<{ hmr?: boolean }, void>({
  remote: true,
  func: async ({ logger, config }, { hmr }, { rpc }) => {
    if (hmr) {
      await pikkuDevReloader({
        srcDirectories: config.srcDirectories,
        logger,
      })
    }

    const configWatcher = chokidar.watch(config.srcDirectories, {
      ignoreInitial: true,
      ignored: /.*\.gen\.tsx?/,
    })

    let watcher = new chokidar.FSWatcher({})

    const generatorWatcher = () => {
      watcher.close()

      logger.info(
        `• Watching directories: \n  - ${config.srcDirectories.join('\n  - ')}`
      )
      watcher = chokidar.watch(config.srcDirectories, {
        ignoreInitial: true,
        ignored: /.*\.gen\.ts/,
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
          timeout = setTimeout(handle, 10)
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
