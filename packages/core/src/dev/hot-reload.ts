import { watch, type FSWatcher } from 'node:fs'
import { stat, readFile } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'

import { pikkuState } from '../pikku-state.js'
import { addFunction } from '../function/function-runner.js'
import { clearMiddlewareCache } from '../middleware-runner.js'
import { clearPermissionsCache } from '../permissions.js'
import { clearChannelMiddlewareCache } from '../wirings/channel/channel-middleware-runner.js'
import { httpRouter } from '../wirings/http/routers/http-router.js'
import { addSchema, compileAllSchemas } from '../schema.js'
import type { Logger } from '../services/logger.js'
import type { CorePikkuFunctionConfig } from '../function/functions.types.js'

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

// Use data: URLs to import modules. This bypasses TypeScript loaders
// (e.g. tsx) that intercept file:// imports and break dynamic ESM loading.
// Each import gets unique content so there's no module cache to worry about.
const reimportModule = async (
  filePath: string
): Promise<Record<string, unknown> | null> => {
  try {
    const content = await readFile(resolve(filePath), 'utf-8')
    const dataUrl =
      'data:text/javascript;base64,' + Buffer.from(content).toString('base64')
    return await import(dataUrl)
  } catch {
    return null
  }
}

const isWatchedTsFile = (filename: string): boolean => {
  return (
    filename.endsWith('.ts') &&
    !filename.endsWith('.test.ts') &&
    !filename.endsWith('.d.ts') &&
    !filename.endsWith('.gen.ts')
  )
}

export async function pikkuDevReloader(
  options: PikkuDevReloaderOptions
): Promise<{ close: () => void }> {
  const { srcDirectories, logger, pikkuDir = '.pikku' } = options
  const absSrcDirs = srcDirectories.map((d) => resolve(d))
  const absPikkuDir = resolve(pikkuDir)
  const watchers: FSWatcher[] = []

  const functionsMap = pikkuState(null, 'function', 'functions')

  const handleFileChange = async (changedTsFile: string) => {
    const start = Date.now()
    const reloadedNames: string[] = []

    const srcDir = absSrcDirs.find((d) => changedTsFile.startsWith(d))
    if (!srcDir) return

    const compiledFile = await findCompiledFile(
      changedTsFile,
      srcDir,
      absPikkuDir
    )
    if (!compiledFile) {
      logger.warn(
        `Could not find compiled JS for: ${relative(process.cwd(), changedTsFile)}`
      )
      return
    }

    const mod = await reimportModule(compiledFile)
    if (!mod) {
      logger.error(
        `Failed to import: ${relative(process.cwd(), compiledFile)} (keeping old code)`
      )
      return
    }

    let schemasChanged = false

    for (const [exportName, exportValue] of Object.entries(mod)) {
      if (isFunctionConfig(exportValue) && functionsMap.has(exportName)) {
        addFunction(exportName, exportValue)
        reloadedNames.push(exportName)

        if (exportValue.input) {
          addSchema(exportName, exportValue.input)
          schemasChanged = true
        }
        if (exportValue.output) {
          addSchema(`${exportName}Output`, exportValue.output)
          schemasChanged = true
        }
      }
    }

    if (reloadedNames.length > 0) {
      clearMiddlewareCache()
      clearPermissionsCache()
      clearChannelMiddlewareCache()
      httpRouter.reset()

      if (schemasChanged) {
        try {
          compileAllSchemas(logger)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (
            msg.includes('SchemaService') ||
            (msg.includes('schema') && msg.includes('not'))
          ) {
            logger.warn('Schema recompilation skipped (no SchemaService)')
          } else {
            logger.error(`Schema recompilation failed: ${msg}`)
            return
          }
        }
      }

      const elapsed = Date.now() - start
      logger.info(`Hot-reloaded: ${reloadedNames.join(', ')} (${elapsed}ms)`)
    }
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  const pendingChanges = new Set<string>()

  const scheduleReload = (filePath: string) => {
    pendingChanges.add(filePath)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      const files = [...pendingChanges]
      pendingChanges.clear()
      for (const file of files) {
        try {
          await handleFileChange(file)
        } catch (err) {
          logger.error(
            `Hot-reload error for ${relative(process.cwd(), file)}: ${err instanceof Error ? err.message : String(err)}`
          )
        }
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
    },
  }
}
