import { pikkuVoidFunc } from '../../../.pikku/pikku-types.gen.js'
import chokidar from 'chokidar'

export const watch: any = pikkuVoidFunc({
  func: async ({ logger, cliConfig, rpc }) => {
    const configWatcher = chokidar.watch(cliConfig.srcDirectories, {
      ignoreInitial: true,
      ignored: /.*\.gen\.tsx?/,
    })

    let watcher = new chokidar.FSWatcher({})

    const generatorWatcher = () => {
      watcher.close()

      logger.info(
        `• Watching directories: \n  - ${cliConfig.srcDirectories.join('\n  - ')}`
      )
      watcher = chokidar.watch(cliConfig.srcDirectories, {
        ignoreInitial: true,
        ignored: /.*\.gen\.ts/,
      })

      watcher.on('ready', async () => {
        const handle = async () => {
          try {
            const start = Date.now()
            await rpc.invoke('all', null)
            logger.info({
              message: `✓ Generated in ${Date.now() - start}ms`,
              type: 'timing',
            })
          } catch (err) {
            console.error(err)
            console.info()
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
