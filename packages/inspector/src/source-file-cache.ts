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

    const hash = createHash('sha1').update(text).digest('hex')
    const hit = cache.get(fileName)
    if (hit && hit.hash === hash) {
      reused++
      return hit.file
    }
    const file = ts.createSourceFile(
      fileName,
      text,
      languageVersionOrOptions,
      true
    )
    cache.set(fileName, { hash, file })
    return file
  }

  return Object.assign(host, {
    reused: () => reused,
    prune: (program: ts.Program) => {
      const live = new Set(program.getSourceFiles().map((sf) => sf.fileName))
      for (const fileName of cache.keys()) {
        if (!live.has(fileName)) cache.delete(fileName)
      }
    },
  })
}
