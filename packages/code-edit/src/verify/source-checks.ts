import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.pikku',
  'dist',
  'build',
  '.next',
  '.output',
  '.yarn',
  'paraglide',
])

/** Every `.ts`/`.tsx` file under `dir`, skipping vendor and generated directories. */
export function sourceFiles(
  dir: string,
  { includeGenerated = false }: { includeGenerated?: boolean } = {}
): string[] {
  const files: string[] = []
  const walk = (current: string, depth: number) => {
    if (depth > 12) return
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full, depth + 1)
      } else if (
        /\.tsx?$/.test(entry.name) &&
        !entry.name.endsWith('.d.ts') &&
        (includeGenerated || !entry.name.includes('.gen.'))
      ) {
        files.push(full)
      }
    }
  }
  walk(dir, 0)
  return files
}

const readSafe = (path: string): string => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

const lineOf = (text: string, index: number): number =>
  text.slice(0, index).split('\n').length

export type SourceHit = { file: string; line: number; text: string }

const AS_I18N_MISUSE = /\basI18n\(\s*(m\.|`)/g

/** `asI18n(m.x())` (already branded) and ``asI18n(`…`)`` (hardcoded copy branded past the i18n type) call sites. */
export function asI18nMisuse(dir: string): SourceHit[] {
  const hits: SourceHit[] = []
  for (const file of sourceFiles(dir)) {
    const text = readSafe(file)
    if (!text.includes('asI18n')) continue
    for (const match of text.matchAll(AS_I18N_MISUSE)) {
      const line = lineOf(text, match.index)
      hits.push({
        file,
        line,
        text: text.split('\n')[line - 1]!.trim().slice(0, 160),
      })
    }
  }
  return hits
}

export type BrokenCatalog = { file: string; error: string }

/** Message catalogs under `<appDir>/messages` that are not valid JSON; Paraglide keeps serving the last good compile, so every newer key reads as missing. */
export function brokenMessageCatalogs(appDir: string): BrokenCatalog[] {
  const messagesDir = join(appDir, 'messages')
  if (!existsSync(messagesDir)) return []
  const broken: BrokenCatalog[] = []
  for (const name of readdirSync(messagesDir).filter((f) =>
    f.endsWith('.json')
  )) {
    const file = join(messagesDir, name)
    try {
      JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      broken.push({
        file,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return broken
}

const ZOD_GEN_IMPORT =
  /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]*zod\.gen(?:\.js)?['"]/g
const ZOD_GEN_EXPORT =
  /^export\s+(?:declare\s+)?(?:const|type|interface|enum|class|function)\s+([A-Za-z_$][\w$]*)/gm

export type StaleZodImport = { file: string; line: number; name: string }

/** Names source imports from the generated table zod (`<outDir>/db/zod.gen.ts`) that it does not export; null when that file was never generated. */
export function staleTableZod(
  srcDirs: readonly string[],
  outDir: string
): StaleZodImport[] | null {
  const generated = readSafe(join(outDir, 'db', 'zod.gen.ts'))
  if (!generated) return null
  const exported = new Set<string>()
  for (const match of generated.matchAll(ZOD_GEN_EXPORT))
    exported.add(match[1]!)
  const missing: StaleZodImport[] = []
  const seen = new Set<string>()
  for (const dir of srcDirs) {
    for (const file of sourceFiles(dir)) {
      const text = readSafe(file)
      if (!text.includes('zod.gen')) continue
      for (const match of text.matchAll(ZOD_GEN_IMPORT)) {
        for (const raw of match[1]!.split(',')) {
          const name = raw
            .replace(/^\s*type\s+/, '')
            .split(/\s+as\s+/)[0]!
            .trim()
          if (!name || exported.has(name) || seen.has(name)) continue
          seen.add(name)
          missing.push({ file, line: lineOf(text, match.index), name })
        }
      }
    }
  }
  return missing
}
