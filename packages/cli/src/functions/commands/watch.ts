import { generateRouteTrees } from '../../utils/route-tree.js'
import { pikkuSessionlessFunc } from '#pikku/function'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import chokidar from 'chokidar'
import { pikkuDevReloader } from '@pikku/core/dev'
import { createTypecheckClient } from '../../utils/warm-typecheck.js'
import {
  checkProjects,
  compileMessages,
  createWatchLoop,
  watchedDirs,
} from '../../utils/watch-loop.js'
import {
  isIgnoredByWatcher,
  watchStatusFile,
} from '../../utils/watch-status.js'
import {
  codegenStateFile,
  collectCodegenPass,
  runCodegenChild,
} from './codegen-child.js'

export const watch = pikkuSessionlessFunc<{ hmr?: boolean }, void>({
  remote: true,
  func: async ({ logger, config }, { hmr }) => {
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

    const dirs = watchedDirs(config.rootDir, watchDirectories)
    const watcher = chokidar.watch(
      [...dirs.codegenDirs, ...dirs.typecheckDirs],
      {
        ignoreInitial: true,
        ignored: (path) => isIgnoredByWatcher(path, dirs),
      }
    )

    logger.info(
      `• Watching directories: \n  - ${watchDirectories.join('\n  - ')}`
    )

    const typechecker = createTypecheckClient(config.rootDir)
    const loop = createWatchLoop({
      statusFile: watchStatusFile(resolve(config.rootDir, config.outDir)),
      dirs,
      debounceMs: 1000,
      codegen: () =>
        collectCodegenPass(async (diagnosticsFile) => {
          const start = Date.now()
          const stateFile = codegenStateFile()
          try {
            await runCodegenChild(stateFile, {
              command: ['all'],
              config: config.config,
              outDir: config.outDir,
              logLevel: (config as { logLevel?: string }).logLevel,
              inheritStdout: true,
              diagnosticsFile,
            })
          } finally {
            await rm(stateFile, { force: true })
          }
          logger.info({
            message: `✓ Generated in ${Date.now() - start}ms`,
            type: 'timing',
          })
        }),
      messages: () => compileMessages(dirs.typecheckDirs),
      routes: () => generateRouteTrees(dirs.typecheckDirs),
      typecheck: () => typechecker.check(checkProjects(config.rootDir)),
      onError: (message) => logger.error(message),
    })

    // Fire-and-forget listener: the loop turns every failure into a status.
    watcher.on('ready', () => {
      void loop.start({ codegen: true })
      watcher.on('change', loop.onChange)
      watcher.on('add', loop.onChange)
      watcher.on('unlink', loop.onChange)
    })

    const onSigint = async () => {
      try {
        await watcher.close()
      } finally {
        process.exit(0)
      }
    }
    // Fire-and-forget signal handler: the finally block always exits the process,
    // so there is no caller to propagate a rejection to.
    process.once('SIGINT', () => void onSigint())

    // Without this the command returns the moment the handlers are registered and
    // the process exits, taking the watcher with it — chokidar's `ready` never
    // fires, so `pikku watch` regenerated nothing at all.
    await new Promise(() => {})
  },
})
