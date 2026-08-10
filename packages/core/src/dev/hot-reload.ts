import { watch, type FSWatcher } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, join, resolve, relative } from 'node:path'

import { pikkuState } from '../pikku-state.js'
import { clearMiddlewareCache } from '../middleware-runner.js'
import { clearPermissionsCache } from '../permissions.js'
import { clearChannelMiddlewareCache } from '../wirings/channel/channel-middleware-runner.js'
import { httpRouter } from '../wirings/http/routers/http-router.js'
import type { Logger } from '../services/logger.js'
import type { CorePikkuFunctionConfig } from '../function/functions.types.js'
import { createModuleRunner } from './module-runner.js'

export * from './reload-meta.js'

interface PikkuDevReloaderOptions {
  srcDirectories: string[]
  logger: Logger
  pikkuDir?: string
}

const isFunctionConfig = (
  value: unknown
): value is CorePikkuFunctionConfig<any, any> => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'func' in value &&
    typeof (value as { func?: unknown }).func === 'function'
  )
}

const findCompiledFile = async (
  tsFile: string,
  srcDir: string,
  pikkuDir: string
): Promise<string | null> => {
  const rel = relative(srcDir, tsFile).replace(/\.ts$/, '.js')
  const candidates = [
    join(pikkuDir, 'dist', rel),
    join(srcDir, rel),
    tsFile.replace(/\.ts$/, '.js'),
  ]
  for (const candidate of candidates) {
    try {
      await stat(candidate)
      return candidate
    } catch {
      // not found, try next
    }
  }
  return null
}

const isWatchedTsFile = (filename: string): boolean => {
  return (
    filename.endsWith('.ts') &&
    !filename.endsWith('.test.ts') &&
    !filename.endsWith('.d.ts') &&
    !filename.endsWith('.gen.ts') &&
    // Hidden files: editor/sed atomic-write temps must never trigger a reload.
    !basename(filename).startsWith('.')
  )
}

export interface PikkuDevReloaderHandle {
  close: () => void
  /** Re-import every file changed since the last drain (post-codegen, once
   *  fresh meta is in state). */
  reimportPending: () => Promise<void>
}

export async function pikkuDevReloader(
  options: PikkuDevReloaderOptions
): Promise<PikkuDevReloaderHandle> {
  const { srcDirectories, logger, pikkuDir = '.pikku' } = options
  const absSrcDirs = srcDirectories.map((d) => resolve(d))
  const absPikkuDir = resolve(pikkuDir)
  const watchers: FSWatcher[] = []

  const functionsMap = pikkuState(null, 'function', 'functions')
  const moduleRunner = createModuleRunner()

  const handleFileChange = async (changedTsFile: string) => {
    const start = Date.now()
    const reloadedNames: string[] = []
    const addedNames: string[] = []

    const srcDir = absSrcDirs.find((d) => changedTsFile.startsWith(d))
    if (!srcDir) return

    const compiledFile = await findCompiledFile(
      changedTsFile,
      srcDir,
      absPikkuDir
    )
    const importPath = compiledFile ?? changedTsFile

    const mod = await moduleRunner.run(importPath)
    if (!mod) {
      logger.error(
        `Failed to import: ${relative(process.cwd(), importPath)} (keeping old code)`
      )
      return
    }

    // knowledge: decisions/internals/hot-reload-writes-into-the-function-map-captured-at-startup.md
    for (const [exportName, exportValue] of Object.entries(mod)) {
      if (!isFunctionConfig(exportValue)) continue
      const isNew = !functionsMap.has(exportName)
      functionsMap.set(exportName, exportValue)
      if (isNew) addedNames.push(exportName)
      else reloadedNames.push(exportName)
    }

    // Re-importing re-ran the module’s wire* side effects, so reset the router
    // and caches even when no function export changed — a wiring-only edit has
    // to rebuild the route matchers too.
    clearMiddlewareCache()
    clearPermissionsCache()
    clearChannelMiddlewareCache()
    httpRouter.reset()

    if (reloadedNames.length > 0 || addedNames.length > 0) {
      const elapsed = Date.now() - start
      const parts: string[] = []
      if (reloadedNames.length > 0) parts.push(reloadedNames.join(', '))
      if (addedNames.length > 0) parts.push(`new: ${addedNames.join(', ')}`)
      logger.info(`Hot-reloaded: ${parts.join('; ')} (${elapsed}ms)`)
    }
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  const pendingChanges = new Set<string>()
  // Files re-imported since the last reimportPending() drain, re-run after the
  // dev server's codegen pass so registrations skipped for missing meta retry.
  const postCodegenQueue = new Set<string>()

  const safeHandleFileChange = async (file: string) => {
    try {
      await handleFileChange(file)
    } catch (err) {
      logger.error(
        `Hot-reload error for ${relative(process.cwd(), file)}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  const scheduleReload = (filePath: string) => {
    pendingChanges.add(filePath)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      const files = [...pendingChanges]
      pendingChanges.clear()
      for (const file of files) {
        postCodegenQueue.add(file)
        await safeHandleFileChange(file)
      }
    }, 50)
  }

  for (const srcDir of absSrcDirs) {
    try {
      const watcher = watch(
        srcDir,
        { recursive: true },
        (eventType, filename) => {
          if (filename && isWatchedTsFile(filename)) {
            scheduleReload(join(srcDir, filename))
          }
        }
      )
      watchers.push(watcher)
    } catch (err: any) {
      logger.error(
        `Failed to watch directory ${srcDir}: ${err?.message || err}`
      )
    }
  }

  logger.info(`Hot-reload active for: ${srcDirectories.join(', ')}`)

  return {
    close: () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      for (const watcher of watchers) {
        watcher.close()
      }
      moduleRunner.clear()
    },
    reimportPending: async () => {
      const files = [...postCodegenQueue]
      postCodegenQueue.clear()
      for (const file of files) {
        await safeHandleFileChange(file)
      }
    },
  }
}
