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
    typeof (value as any).func === 'function'
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

// Changed user files are re-run through an evictable module runner keyed by a
// stable path (createModuleRunner), NOT re-imported under a fresh URL. A
// fresh-URL import (a `data:` URL on Node, a uniquely-named temp sibling on
// Bun) permanently leaks a record in the native ESM loader map on every
// reload, OOMing long editing sessions; the runner overwrites a single slot so
// the previous module is collected. See ./module-runner.ts.
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

    // Register every function-config export — replacing known functions AND
    // adding new ones (a brand-new function becomes callable as soon as its
    // meta lands via reloadGeneratedMeta after the next codegen pass).
    // Write into the map captured at startup, NOT pikkuState's current one:
    // a dev-server watcher may have temporarily swapped in a codegen-scoped
    // map for the same file event (runAllWithCommandState), and a write to
    // that map is silently discarded when it restores the original.
    // Schemas are NOT touched here: `input`/`output` hold raw zod schemas,
    // while the schema map carries codegen-generated JSON schemas — mixing the
    // two crashed every reload. Fresh JSON schemas arrive via
    // reloadGeneratedMeta once codegen has re-emitted them.
    for (const [exportName, exportValue] of Object.entries(mod)) {
      if (!isFunctionConfig(exportValue)) continue
      const isNew = !functionsMap.has(exportName)
      functionsMap.set(exportName, exportValue)
      if (isNew) addedNames.push(exportName)
      else reloadedNames.push(exportName)
    }

    // Re-importing the module re-ran its wire* side effects (wireHTTP et al
    // are keyed map-sets, so re-registration replaces/adds) — reset the
    // router and caches even when no function export changed, so a
    // wiring-only file edit rebuilds the route matchers too.
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
  // Files re-imported since the last reimportPending() drain. A dev-server
  // watcher drains this after its codegen pass so wire* registrations that
  // were skipped for missing meta (a NEW route) run again with fresh meta.
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
    // Drain the queue of recently re-imported files and import them again.
    // A dev-server watcher calls this AFTER its codegen pass has refreshed
    // the generated meta (reloadGeneratedMeta): wire* registrations skip
    // routes whose meta doesn't exist yet, so a wiring file changed
    // alongside a NEW function only registers its new route when
    // re-imported after the fresh meta has landed.
    reimportPending: async () => {
      const files = [...postCodegenQueue]
      postCodegenQueue.clear()
      for (const file of files) {
        await safeHandleFileChange(file)
      }
    },
  }
}
