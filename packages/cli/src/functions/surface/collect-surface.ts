import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'

export type SurfaceKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'const'
  | 'enum'
  | 'namespace'

export type SurfaceSymbol = {
  name: string
  kind: SurfaceKind
  /** Package-relative path of the file that declares it. */
  declaredAt: string
  deprecated: boolean
}

export type SurfaceEntrypoint = {
  /** The key in the exports map, e.g. `.` or `./http`. */
  subpath: string
  /** How an importer writes it, e.g. `@pikku/core/http`. */
  specifier: string
  /** Package-relative path of the source file the subpath resolves to. */
  entryFile: string
  symbols: SurfaceSymbol[]
}

type PackageJson = {
  name?: string
  exports?: Record<string, unknown> | string
}

/** Extensions a `ts.Program` can be rooted at. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts']

/**
 * Whether a subpath publishes code at all.
 *
 * An exports map is also how a package publishes a stylesheet or a JSON
 * manifest, and those subpaths carry no exported names — feeding them to the
 * compiler would only produce a program full of unresolvable roots.
 */
const publishesCode = (target: string): boolean =>
  !/\.(css|scss|json|svg|png|woff2?|txt|md)$/.test(target)

/**
 * The source file a published subpath was built from.
 *
 * Two conventions have to work. A package that ships build output points at it
 * (`./dist/index.js`, `./dist/src/index.js` — both are in this repo), and the
 * source has to be recovered by stripping the output directory. A package
 * consumed only inside its own workspace has no build step to point at and
 * names the TypeScript source directly (`./src/index.ts`), which needs no
 * recovery at all. Rather than model every layout, try the shapes each
 * convention produces and take the first that exists on disk.
 */
const sourceForTarget = (
  packageDir: string,
  target: string,
  outDir: string
): string | null => {
  const withoutPrefix = target.replace(/^\.\//, '')

  // Already source: the common case outside a published package.
  if (
    SOURCE_EXTENSIONS.some((extension) => withoutPrefix.endsWith(extension))
  ) {
    return existsSync(join(packageDir, withoutPrefix)) ? withoutPrefix : null
  }

  const stripped = withoutPrefix.startsWith(`${outDir}/`)
    ? withoutPrefix.slice(outDir.length + 1)
    : withoutPrefix
  const base = stripped.replace(/\.(js|mjs|cjs)$/, '')
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

/**
 * The concrete subpaths a wildcard pattern stands for.
 *
 * `"./parts/*": "./src/parts/*"` publishes whatever sits in that directory, so
 * the surface it declares is only knowable by looking. A package can also map
 * the same directory twice — once as `*.js` and once bare — and both patterns
 * resolve to the same files, so the caller de-duplicates by entry file.
 */
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
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (suffix && !entry.name.endsWith(suffix)) continue
    if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue
    const stem = entry.name.replace(/\.(ts|tsx|mts|cts)$/, '')
    expanded.push({
      subpath: subpath.replace('*', stem).replace(/\.js$/, ''),
      target: `${targetDir}${entry.name}`,
    })
  }
  return expanded
}

/** The `types` / `import` / `default` condition that names a real file. */
const targetOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value
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

/**
 * The compiler options a package is built with, narrowed to what resolution
 * needs: where output lands, and the path mappings an import may rely on.
 */
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

/**
 * What an exported name is, judged after following aliases.
 *
 * A re-exported name arrives as an alias symbol whose own flags say `Alias`
 * and nothing else, so the flags that matter belong to what it points at. An
 * arrow function assigned to a `const` is a `Variable` whose type has call
 * signatures — reported as a function, because that is what a caller sees.
 */
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

/**
 * Every name each of a package's published entry points exports.
 *
 * Resolution goes through a real `ts.Program` rather than reading export
 * statements, because a parser cannot answer what `export *` re-exports —
 * only the checker knows, and a barrel built from `export *` is otherwise
 * invisible to the whole measurement.
 */
export const collectSurface = async (
  packageDir: string
): Promise<SurfaceEntrypoint[]> => {
  const root = resolve(packageDir)
  const packageJson = await readJson<PackageJson>(join(root, 'package.json'))
  if (!packageJson?.exports || typeof packageJson.exports === 'string')
    return []

  const { outDir, paths } = await readCompilerOptions(root)
  const packageName = packageJson.name ?? ''

  const entries: Array<{
    subpath: string
    specifier: string
    entryFile: string
  }> = []

  const seenEntryFiles = new Set<string>()

  for (const [subpath, value] of Object.entries(packageJson.exports)) {
    if (!subpath.startsWith('.')) continue
    const target = targetOf(value)
    if (!target || !publishesCode(target)) continue

    const declared = target.includes('*')
      ? expandWildcard(root, subpath, target)
      : [{ subpath, target }]

    for (const each of declared) {
      const entryFile = sourceForTarget(root, each.target, outDir)
      if (!entryFile || seenEntryFiles.has(entryFile)) continue
      seenEntryFiles.add(entryFile)
      entries.push({
        subpath: each.subpath,
        specifier:
          each.subpath === '.'
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
      symbols.push({
        name: symbol.getName(),
        kind: kindOf(symbol, checker),
        declaredAt: file ? relative(root, file) : entry.entryFile,
        deprecated: isDeprecated(symbol),
      })
    }

    return { ...entry, symbols }
  })
}
