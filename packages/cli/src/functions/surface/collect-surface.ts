import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'

export type SurfaceKind =
  'function' | 'class' | 'interface' | 'type' | 'const' | 'enum' | 'namespace'

export type SurfaceSymbol = {
  name: string
  kind: SurfaceKind
  declaredAt: string
  /** Absolute path of the declaring file, or null when it could not be found. */
  declaredIn: string | null
  deprecated: boolean
  /** The text of the `@deprecated` tag, when it carries one. */
  deprecatedReason?: string
  /** First paragraph of the symbol's JSDoc. */
  summary?: string
  /** How the type checker renders the symbol's type. */
  signature?: string
}

export type SurfaceEntrypoint = {
  subpath: string
  specifier: string
  entryFile: string
  symbols: SurfaceSymbol[]
}

export type CollectSurfaceOptions = {
  /**
   * Read the package's `imports` map instead of its `exports` map, taking the
   * one key given — `#pikku/*` is what an application reaches its generated
   * leaves through, and it is a private specifier rather than a published one.
   */
  importsSubpath?: string
  /** Restrict collection to these subpaths, so the program stays small. */
  subpaths?: string[]
}

type PackageJson = {
  name?: string
  exports?: Record<string, unknown> | string
  imports?: Record<string, unknown>
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts']

const MODULE_EXTENSIONS = [...SOURCE_EXTENSIONS, '.js', '.jsx', '.mjs', '.cjs']

const wildcardStem = (fileName: string): string | null => {
  if (fileName.endsWith('.map')) return null
  if (/\.d\.(ts|mts|cts)$/.test(fileName)) return null
  const extension = MODULE_EXTENSIONS.find((each) => fileName.endsWith(each))
  return extension ? fileName.slice(0, -extension.length) : null
}

const subpathMap = (
  exports: NonNullable<PackageJson['exports']>
): Record<string, unknown> => {
  if (typeof exports === 'string') return { '.': exports }
  return Object.keys(exports).some((key) => key.startsWith('.'))
    ? exports
    : { '.': exports }
}

const publishesCode = (target: string): boolean =>
  !/\.(css|scss|json|svg|png|woff2?|txt|md)$/.test(target)

const sourceForTarget = (
  packageDir: string,
  target: string,
  outDir: string
): string | null => {
  const withoutPrefix = target.replace(/^\.\//, '')

  const isDeclaration = /\.d\.(ts|mts|cts)$/.test(withoutPrefix)

  if (
    !isDeclaration &&
    SOURCE_EXTENSIONS.some((extension) => withoutPrefix.endsWith(extension))
  ) {
    return existsSync(join(packageDir, withoutPrefix)) ? withoutPrefix : null
  }

  const stripped = withoutPrefix.startsWith(`${outDir}/`)
    ? withoutPrefix.slice(outDir.length + 1)
    : withoutPrefix
  const base = stripped
    .replace(/\.d\.(ts|mts|cts)$/, '')
    .replace(/\.(js|jsx|mjs|cjs)$/, '')
  const withoutSrc = base.startsWith('src/') ? base.slice(4) : base

  const candidates: string[] = []
  for (const extension of SOURCE_EXTENSIONS) {
    candidates.push(
      join('src', `${base}${extension}`),
      `${base}${extension}`,
      join('src', `${withoutSrc}${extension}`),
      join('src', base, `index${extension}`),
      join(base, `index${extension}`)
    )
  }
  for (const candidate of candidates) {
    if (existsSync(join(packageDir, candidate))) return candidate
  }
  return null
}

const expandWildcard = (
  packageDir: string,
  subpath: string,
  target: string
): Array<{ subpath: string; target: string }> => {
  const targetDir = target.replace(/^\.\//, '').split('*')[0] ?? ''
  const suffix = target.slice(target.indexOf('*') + 1)
  const absolute = join(packageDir, targetDir)
  if (!existsSync(absolute)) return []

  const expanded: Array<{ subpath: string; target: string }> = []
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(directory, entry.name), `${prefix}${entry.name}/`)
        continue
      }
      if (!entry.isFile()) continue
      if (wildcardStem(entry.name) === null) continue
      // The suffix is matched against the path the wildcard stands in for, not
      // the file name, so `#pikku/*` → `./.pikku/*/index.ts` captures the leaf
      // directory rather than failing to match `index.ts` against `/index.ts`.
      const relativePath = `${prefix}${entry.name}`
      if (suffix && !relativePath.endsWith(suffix)) continue
      const captured = suffix
        ? relativePath.slice(0, -suffix.length)
        : `${prefix}${wildcardStem(entry.name)}`
      if (!captured) continue
      expanded.push({
        subpath: subpath.replace('*', captured),
        target: `${targetDir}${relativePath}`,
      })
    }
  }
  walk(absolute, '')
  return expanded
}

const targetOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  // A fallback array declares the same specifier several ways; the first entry
  // is the one a resolver reaches for, and the rest only matter when it misses.
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const resolved = targetOf(candidate)
      if (resolved) return resolved
    }
    return null
  }
  if (!value || typeof value !== 'object') return null
  const conditions = value as Record<string, unknown>
  for (const key of ['types', 'import', 'default', 'require']) {
    const resolved = targetOf(conditions[key])
    if (resolved) return resolved
  }
  return null
}

const readJson = async <T>(path: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

const readCompilerOptions = async (
  packageDir: string
): Promise<{ outDir: string; paths: ts.CompilerOptions }> => {
  const configPath = join(packageDir, 'tsconfig.json')
  if (!existsSync(configPath)) return { outDir: 'dist', paths: {} }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) return { outDir: 'dist', paths: {} }

  const { options } = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    packageDir
  )
  const { baseUrl, paths, pathsBasePath } = options
  return {
    outDir: options.outDir ? relative(packageDir, options.outDir) : 'dist',
    paths: {
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      ...(paths !== undefined ? { paths } : {}),
      ...(pathsBasePath !== undefined ? { pathsBasePath } : {}),
    },
  }
}

const KIND_BY_FLAG: Array<[ts.SymbolFlags, SurfaceKind]> = [
  [ts.SymbolFlags.Class, 'class'],
  [ts.SymbolFlags.Interface, 'interface'],
  [ts.SymbolFlags.RegularEnum | ts.SymbolFlags.ConstEnum, 'enum'],
  [ts.SymbolFlags.Function, 'function'],
  [ts.SymbolFlags.TypeAlias, 'type'],
  [ts.SymbolFlags.Namespace, 'namespace'],
]

const kindOf = (symbol: ts.Symbol, checker: ts.TypeChecker): SurfaceKind => {
  const target =
    symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol

  for (const [flag, kind] of KIND_BY_FLAG) {
    if (target.flags & flag) return kind
  }

  if (target.flags & ts.SymbolFlags.Variable) {
    const declaration = target.declarations?.[0]
    if (declaration) {
      const type = checker.getTypeOfSymbolAtLocation(target, declaration)
      if (type.getCallSignatures().length > 0) return 'function'
    }
    return 'const'
  }

  return 'const'
}

const isDeprecated = (symbol: ts.Symbol): boolean =>
  symbol.getJsDocTags().some((tag) => tag.name === 'deprecated')

const deprecationReason = (symbol: ts.Symbol): string | undefined => {
  const tag = symbol.getJsDocTags().find((each) => each.name === 'deprecated')
  if (!tag) return undefined
  const text = ts.displayPartsToString(tag.text).trim()
  return text.length > 0 ? text : undefined
}

/**
 * The first paragraph of the doc comment. A symbol's JSDoc regularly runs to
 * several paragraphs of examples, and the console shows one line.
 */
const summaryOf = (
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): string | undefined => {
  const documentation = ts
    .displayPartsToString(symbol.getDocumentationComment(checker))
    .trim()
  if (documentation.length === 0) return undefined
  return documentation
    .split(/\n\s*\n/)[0]!
    .replace(/\s+/g, ' ')
    .trim()
}

const SIGNED_KINDS: ReadonlySet<SurfaceKind> = new Set<SurfaceKind>([
  'function',
  'const',
  'class',
])

const signatureOf = (
  symbol: ts.Symbol,
  kind: SurfaceKind,
  checker: ts.TypeChecker
): string | undefined => {
  if (!SIGNED_KINDS.has(kind)) return undefined
  const target =
    symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol
  const declaration = target.declarations?.[0]
  if (!declaration) return undefined
  try {
    const rendered = checker.typeToString(
      checker.getTypeOfSymbolAtLocation(target, declaration),
      declaration,
      ts.TypeFormatFlags.NoTruncation
    )
    return rendered === 'any' || rendered === 'error' ? undefined : rendered
  } catch {
    return undefined
  }
}

const declarationFileOf = (
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): string | null => {
  const target =
    symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol
  const declaration = target.declarations?.[0] ?? symbol.declarations?.[0]
  return declaration?.getSourceFile().fileName ?? null
}

export const collectSurface = async (
  packageDir: string,
  { importsSubpath, subpaths }: CollectSurfaceOptions = {}
): Promise<SurfaceEntrypoint[]> => {
  const root = resolve(packageDir)
  const packageJson = await readJson<PackageJson>(join(root, 'package.json'))
  if (!packageJson) return []

  const declaredMap = importsSubpath
    ? packageJson.imports?.[importsSubpath] !== undefined
      ? { [importsSubpath]: packageJson.imports[importsSubpath] }
      : {}
    : packageJson.exports
      ? subpathMap(packageJson.exports)
      : {}
  if (Object.keys(declaredMap).length === 0) return []

  const { outDir, paths } = await readCompilerOptions(root)
  const packageName = packageJson.name ?? ''

  const entries: Array<{
    subpath: string
    specifier: string
    entryFile: string
  }> = []

  const seenEntryFiles = new Set<string>()

  for (const [subpath, value] of Object.entries(declaredMap)) {
    if (!importsSubpath && !subpath.startsWith('.')) continue
    const target = targetOf(value)
    if (!target || !publishesCode(target)) continue

    const declared = target.includes('*')
      ? expandWildcard(root, subpath, target)
      : [{ subpath, target }]

    for (const each of declared) {
      if (subpaths && !subpaths.includes(each.subpath)) continue
      const entryFile = sourceForTarget(root, each.target, outDir)
      if (!entryFile || seenEntryFiles.has(entryFile)) continue
      seenEntryFiles.add(entryFile)
      entries.push({
        subpath: each.subpath,
        specifier: importsSubpath
          ? each.subpath
          : each.subpath === '.'
            ? packageName
            : `${packageName}${each.subpath.slice(1)}`,
        entryFile,
      })
    }
  }

  if (entries.length === 0) return []

  const program = ts.createProgram(
    entries.map((entry) => join(root, entry.entryFile)),
    {
      ...paths,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      types: [],
      allowJs: false,
      checkJs: false,
    }
  )
  const checker = program.getTypeChecker()

  return entries.map((entry) => {
    const sourceFile = program.getSourceFile(join(root, entry.entryFile))
    const moduleSymbol = sourceFile
      ? checker.getSymbolAtLocation(sourceFile)
      : undefined

    const symbols: SurfaceSymbol[] = []
    for (const symbol of moduleSymbol
      ? checker.getExportsOfModule(moduleSymbol)
      : []) {
      const file = declarationFileOf(symbol, checker)
      const kind = kindOf(symbol, checker)
      symbols.push({
        name: symbol.getName(),
        kind,
        declaredAt: file ? relative(root, file) : entry.entryFile,
        declaredIn: file,
        deprecated: isDeprecated(symbol),
        deprecatedReason: deprecationReason(symbol),
        summary: summaryOf(symbol, checker),
        signature: signatureOf(symbol, kind, checker),
      })
    }

    return { ...entry, symbols }
  })
}
