import chokidar, { type FSWatcher } from 'chokidar'
import type { Logger } from '@pikku/core/services'
import { generateRouteTrees, routeWatchPaths } from '../../utils/route-tree.js'
import { typecheckProjects } from '../../utils/tsc-check.js'
import {
  checkProjects,
  compileMessages,
  createWatchLoop,
  watchedDirs,
} from '../../utils/watch-loop.js'
import {
  WAKE_SIGNAL,
  isIgnoredByWatcher,
  watchStatusFile,
} from '../../utils/watch-status.js'
import { collectCodegenPass, hasChangesSince } from './codegen-child.js'

type WatchConfig = {
  rootDir: string
  config?: string
  security?: boolean
}

/**
 * Watch the project sources and re-run codegen on change, type-checking beside
 * it. `regenerate` is the whole codegen pass (and whatever must follow it);
 * `pikkuDir` is the shared output directory the watch status lives in.
 */
export const startDevWatch = ({
  config,
  logger,
  watchDirectories,
  pikkuDir,
  regenerate,
  startupPass,
  startupCodegenStartedAt,
}: {
  config: WatchConfig
  logger: Logger
  watchDirectories: string[]
  pikkuDir: string
  regenerate: (diagnosticsFile: string) => Promise<void>
  startupPass: Awaited<ReturnType<typeof collectCodegenPass>>
  startupCodegenStartedAt: number
}): FSWatcher => {
  logger.info(
    `• Watching directories: \n  - ${watchDirectories.join('\n  - ')}`
  )
  const dirs = watchedDirs(config.rootDir, watchDirectories, config.config)
  const watcher = chokidar.watch(
    [
      ...new Set([
        ...dirs.codegenDirs,
        ...dirs.typecheckDirs,
        ...(dirs.routePaths ?? []),
      ]),
    ],
    {
      ignoreInitial: true,
      ignored: (path) => isIgnoredByWatcher(path, dirs),
    }
  )
  const onReady = async () => {
    const loop = createWatchLoop({
      statusFile: watchStatusFile(pikkuDir),
      dirs,
      debounceMs: 10,
      security: config.security,
      routePaths: () => routeWatchPaths(dirs.typecheckDirs),
      codegen: () => collectCodegenPass(regenerate),
      messages: () => compileMessages(dirs.typecheckDirs),
      routes: () => generateRouteTrees(dirs.typecheckDirs),
      typecheck: (signal) =>
        typecheckProjects(
          checkProjects(config.rootDir, config.config),
          config.rootDir,
          { signal }
        ),
      onError: (message) => logger.error(message),
    })

    void loop.start({
      codegen: hasChangesSince(watchDirectories, startupCodegenStartedAt),
      startup: startupPass,
    })

    watcher.on('change', loop.onChange)
    watcher.on('add', loop.onChange)
    watcher.on('unlink', loop.onChange)
    process.on(WAKE_SIGNAL, loop.wake)
  }
  // Errors are handled inside the loop, so a rejection cannot escape.
  watcher.on('ready', () => void onReady())
  return watcher
}
