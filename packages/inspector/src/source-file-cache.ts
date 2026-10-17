import * as ts from 'typescript'
import { createHash } from 'crypto'

/**
 * Parsed source files, kept across programs so a re-inspection only re-parses
 * what changed. Keyed by path; an entry is valid while the file's content
 * hash matches.
 *
 * This is the incremental reuse `oldProgram` used to give, without its cost.
 * Passing the previous ts.Program keeps that program reachable, and a program
 * memoises its type checker — so every re-inspection held a second, fully
 * exercised checker for the sake of skipping a re-parse. A bare SourceFile
 * carries its AST and binder symbols and nothing else; sharing it between
 * programs is what the language service's document registry does.
 *
 * Module-level on purpose: `inspect()` is called several times per `pikku all`
 * (and indefinitely in watch mode) from one process, and the cache is only
 * worth having if it outlives the call.
 */
const cache = new Map<string, { hash: string; file: ts.SourceFile }>()

/**
 * A SourceFile is only shareable between programs that would have parsed it
 * the same way: the language version and the module format the program
 * implies for it (ESM vs CJS) are baked into the AST. The inspector and the
 * schema generator use different compiler options, so both go into the key.
 */
const cacheKey = (
  fileName: string,
  languageVersionOrOptions: ts.ScriptTarget | ts.CreateSourceFileOptions
): string => {
  if (typeof languageVersionOrOptions !== 'object') {
    return `${fileName}\0${languageVersionOrOptions}`
  }
  const { languageVersion, impliedNodeFormat, jsDocParsingMode } =
    languageVersionOrOptions
  return `${fileName}\0${languageVersion}\0${impliedNodeFormat ?? ''}\0${jsDocParsingMode ?? ''}`
}

/**
 * Parse through the shared cache. With `populate: false` the cache is only
 * read: a short-lived program (the schema generator's) reuses what the
 * inspector parsed without pinning its own files past its lifetime.
 */
export const getCachedSourceFile = (
  fileName: string,
  text: string,
  languageVersionOrOptions: ts.ScriptTarget | ts.CreateSourceFileOptions,
  { populate = true }: { populate?: boolean } = {}
): { file: ts.SourceFile; reused: boolean } => {
  const key = cacheKey(fileName, languageVersionOrOptions)
  const hash = createHash('sha1').update(text).digest('hex')
  const hit = cache.get(key)
  if (hit && hit.hash === hash) return { file: hit.file, reused: true }
  const file = ts.createSourceFile(
    fileName,
    text,
    languageVersionOrOptions,
    true
  )
  if (populate) cache.set(key, { hash, file })
  return { file, reused: false }
}

export interface SourceFileCacheHost extends ts.CompilerHost {
  /** Files served from the cache by the program just built. */
  readonly reused: () => number
  /**
   * Drop entries the program did not use, so a file that left the project
   * (or watch mode's churn) does not pin its AST forever.
   */
  readonly prune: (program: ts.Program) => void
}

export const createSourceFileCacheHost = (
  options: ts.CompilerOptions
): SourceFileCacheHost => {
  const host = ts.createCompilerHost(options, true)
  let reused = 0

  host.getSourceFile = (fileName, languageVersionOrOptions, onError) => {
    let text: string | undefined
    try {
      text = host.readFile(fileName)
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e))
      return undefined
    }
    if (text === undefined) return undefined

    const { file, reused: hit } = getCachedSourceFile(
      fileName,
      text,
      languageVersionOrOptions
    )
    if (hit) reused++
    return file
  }

  return Object.assign(host, {
    reused: () => reused,
    prune: (program: ts.Program) => {
      const live = new Set(program.getSourceFiles().map((sf) => sf.fileName))
      for (const [key, entry] of cache) {
        if (!live.has(entry.file.fileName)) cache.delete(key)
      }
    },
  })
}
