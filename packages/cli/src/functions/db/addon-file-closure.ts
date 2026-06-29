import ts from 'typescript'
import { dirname, resolve, join } from 'node:path'

/** Read a source file's content, or null if it doesn't exist. */
export type ReadFile = (absPath: string) => string | null

/** Relative import/export specifiers in a source file. */
function relativeSpecifiers(sf: ts.SourceFile): string[] {
  const specs: string[] = []
  for (const st of sf.statements) {
    if (
      (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) &&
      st.moduleSpecifier &&
      ts.isStringLiteralLike(st.moduleSpecifier) &&
      st.moduleSpecifier.text.startsWith('.')
    ) {
      specs.push(st.moduleSpecifier.text)
    }
  }
  return specs
}

/** Resolve a `.js`-suffixed relative specifier to the on-disk `.ts` source. */
function resolveSpec(
  fromFile: string,
  spec: string,
  readFile: ReadFile
): string | null {
  const dir = dirname(fromFile)
  const base = spec.replace(/\.js$/, '')
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.d.ts`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ].map((c) => resolve(dir, c))
  for (const c of candidates) {
    if (readFile(c) !== null) return c
  }
  return null
}

/**
 * Walk the local-import graph from a set of entry files, returning every
 * reachable first-party source file (abs path → content). This is the transitive
 * copy the service-carve gate refuses to chase: an owned service's impl file
 * plus its sibling-imported types/secret files all come along, so the carved
 * addon is self-contained (and keeps any `wireSecret`/`wireVariable` the impl
 * declares). External-package imports are not followed.
 */
export function collectLocalFileClosure(
  entryAbsPaths: string[],
  readFile: ReadFile
): Map<string, string> {
  const files = new Map<string, string>()
  const queue = [...entryAbsPaths]

  while (queue.length > 0) {
    const abs = queue.shift()!
    if (files.has(abs)) continue
    const content = readFile(abs)
    if (content === null) continue
    files.set(abs, content)

    const sf = ts.createSourceFile(
      abs,
      content,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true
    )
    for (const spec of relativeSpecifiers(sf)) {
      const resolved = resolveSpec(abs, spec, readFile)
      if (resolved && !files.has(resolved)) queue.push(resolved)
    }
  }

  return files
}
