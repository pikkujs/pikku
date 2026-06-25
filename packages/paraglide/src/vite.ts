import type { Plugin } from 'vite'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { generateEnumsSource, type GenerateEnumsOptions } from './generate-enums.js'

export interface ParaglideEnumsOptions extends GenerateEnumsOptions {
  /** Base-locale catalog JSON. Default `'./messages/en.json'`. */
  catalog?: string
  /** Output module. Default `'./src/i18n/i18n-enum.gen.ts'`. */
  outFile?: string
}

/**
 * Vite plugin that regenerates the typed enum-lookup module from the message
 * catalog. Place it AFTER `paraglideVitePlugin` (the generated file imports the
 * compiled `m`). Regenerates on catalog edits in dev; only writes on change so
 * it never loops HMR.
 */
export function paraglideEnums(options: ParaglideEnumsOptions = {}): Plugin {
  const catalog = options.catalog ?? './messages/en.json'
  const outFile = options.outFile ?? './src/i18n/i18n-enum.gen.ts'

  const generate = (): void => {
    const catalogPath = resolve(catalog)
    if (!existsSync(catalogPath)) return
    const data = JSON.parse(readFileSync(catalogPath, 'utf8')) as Record<string, unknown>
    const keys = Object.keys(data).filter((k) => !k.startsWith('$'))
    const next = generateEnumsSource(keys, {
      onWarn: (msg) => console.warn(`[@pikku/paraglide] ${msg}`),
      ...options,
    })
    const outPath = resolve(outFile)
    const prev = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null
    if (prev === next) return
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, next)
  }

  return {
    name: '@pikku/paraglide:enums',
    enforce: 'pre',
    buildStart() {
      generate()
    },
    configureServer(server) {
      const catalogPath = resolve(catalog)
      server.watcher.add(catalogPath)
      const onChange = (file: string): void => {
        if (resolve(file) === catalogPath) generate()
      }
      server.watcher.on('add', onChange)
      server.watcher.on('change', onChange)
    },
  }
}
