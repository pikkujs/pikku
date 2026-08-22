import { pikkuSessionlessFunc } from '#pikku/function'
import chokidar from 'chokidar'
import { pikkuDevReloader } from '@pikku/core/dev'

export const watch = pikkuSessionlessFunc<{ hmr?: boolean }, void>({
  remote: true,
  func: async (
    { logger, config, invalidateInspectorState },
    { hmr },
    { rpc }
  ) => {
    const watchDirectories = [
      ...new Set(
        [config.emailTemplatesDir, ...config.srcDirectories].filter(Boolean)
      ),
    ] as string[]

    if (hmr) {
      await pikkuDevReloader({
        srcDirectories: watchDirectories,
        logger,
      })
    }

    const watcher = chokidar.watch(watchDirectories, {
      ignoreInitial: true,
      ignored: /.*\.gen\.tsx?/,
    })

    logger.info(
      `• Watching directories: \n  - ${watchDirectories.join('\n  - ')}`
    )

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

      // A codegen pass holds a whole ts.Program, so two overlapping passes double
      // the peak RSS. Coalesce instead: changes arriving mid-pass schedule exactly
      // one more run after it.
      let inFlight: Promise<void> | undefined
      let queued = false

      const runHandle = async (): Promise<void> => {
        if (inFlight) {
          queued = true
          return
        }
        do {
          queued = false
          inFlight = handle()
          try {
            await inFlight
          } finally {
            inFlight = undefined
          }
        } while (queued)
      }

      await runHandle()

      let timeout: ReturnType<typeof setTimeout> | undefined

      const deduped = (_file: string) => {
        if (timeout) {
          clearTimeout(timeout)
        }
        timeout = setTimeout(runHandle, 1000)
      }

      watcher.on('change', deduped)
      watcher.on('add', deduped)
      watcher.on('unlink', deduped)
    })

    process.once('SIGINT', async () => {
      await watcher.close()
      process.exit(0)
    })

    // Without this the command returns the moment the handlers are registered and
    // the process exits, taking the watcher with it — chokidar's `ready` never
    // fires, so `pikku watch` regenerated nothing at all.
    await new Promise(() => {})
  },
})
