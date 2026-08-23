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
  /** The symbol's JSDoc in full, paragraphs and examples included. */
  docs?: string
  /** The type as the checker prints it, so a caller knows how to call it. */
  signature?: string
  /**
   * The shape written at the call site, one `name?: type` per entry — the
   * properties of the object a function takes, or of the type itself. The
   * signature names that shape; this says what is in it.
   */
  members?: SurfaceMember[]
  /** The `@example` blocks, which the documentation comment leaves out. */
  examples?: string[]
  /** The HTTP status an error class is registered with. */
  status?: number
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
  target: string,
  outDir: string
): Array<{ subpath: string; target: string }> => {
  const targetDir = target.replace(/^\.\//, '').split('*')[0] ?? ''
  const suffix = target.slice(target.indexOf('*') + 1)
  const suffixStem = wildcardStem(suffix) ?? suffix
  // A package that points its subpaths at the build output has nothing to walk
  // until it is built, so the sources the output would be compiled from stand
  // in for it. `sourceForTarget` strips the same prefix, so the target stays
  // the declared one and only the directory being read changes.
  const scanDir =
    existsSync(join(packageDir, targetDir)) ||
    !targetDir.startsWith(`${outDir}/`)
      ? targetDir
      : targetDir.slice(outDir.length + 1)
  const absolute = join(packageDir, scanDir)
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
      // Matched without extensions, so a `*/index.js` target still finds the
      // `index.ts` it would have been compiled from.
      const pathStem = `${prefix}${wildcardStem(entry.name)}`
      if (suffixStem && !pathStem.endsWith(suffixStem)) continue
      const captured = suffixStem
        ? pathStem.slice(0, -suffixStem.length)
        : pathStem
      if (!captured) continue
      expanded.push({
        subpath: subpath.replace('*', captured),
        target: `${scanDir}${relativePath}`,
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

/**
 * A leaf re-exports through `export *`, so the symbol reached here is an alias
 * that carries no kind, no documentation, no tags and no type of its own.
 */
const aliasTargetOf = (
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): ts.Symbol =>
  symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol

const kindOf = (symbol: ts.Symbol, checker: ts.TypeChecker): SurfaceKind => {
  const target = aliasTargetOf(symbol, checker)

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

const jsDocTagsOf = (
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): ts.JSDocTagInfo[] => {
  const own = symbol.getJsDocTags(checker)
  if (own.length > 0) return own
  return aliasTargetOf(symbol, checker).getJsDocTags(checker)
}

const isDeprecated = (tags: ts.JSDocTagInfo[]): boolean =>
  tags.some((tag) => tag.name === 'deprecated')

const deprecationReason = (tags: ts.JSDocTagInfo[]): string | undefined => {
  const tag = tags.find((each) => each.name === 'deprecated')
  if (!tag) return undefined
  const text = ts.displayPartsToString(tag.text).trim()
  return text.length > 0 ? text : undefined
}

/**
 * The `@example` blocks. `getDocumentationComment` returns the description only,
 * so an example an author wrote is dropped unless the tags are read separately.
 */
const examplesOf = (tags: ts.JSDocTagInfo[]): string[] =>
  tags
    .filter((tag) => tag.name === 'example')
    .map((tag) => ts.displayPartsToString(tag.text).trim())
    .filter((text) => text.length > 0)

/**
 * The doc comment as written. A leaf re-exports through `export *`, so the
 * symbol reached here is an alias carrying no documentation of its own, and an
 * overloaded function documents whichever overload the author chose to explain
 * — hence the walk through the aliased symbol and then every declaration.
 */
const documentationOf = (
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): string | undefined => {
  const targets = [symbol]
  if (symbol.flags & ts.SymbolFlags.Alias) {
    targets.push(checker.getAliasedSymbol(symbol))
  }
  for (const target of targets) {
    const documentation = ts
      .displayPartsToString(target.getDocumentationComment(checker))
      .trim()
    if (documentation.length > 0) return documentation
  }
  return undefined
}

/**
 * The first paragraph of the doc comment. A symbol's JSDoc regularly runs to
 * several paragraphs of examples, and a list row shows one line.
 */
const summaryOf = (documentation: string | undefined): string | undefined => {
  if (!documentation) return undefined
  return documentation
    .split(/\n\s*\n/)[0]!
    .replace(/\s+/g, ' ')
    .trim()
}

const declarationFileOf = (
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): string | null => {
  const target = aliasTargetOf(symbol, checker)
  const declaration = target.declarations?.[0] ?? symbol.declarations?.[0]
  return declaration?.getSourceFile().fileName ?? null
}

/**
 * `NoTruncation` is the load-bearing one: the default cuts a type off at ~160
 * characters, which lands in the middle of the generics of every wiring helper.
 * `UseAliasDefinedOutsideCurrentScope` keeps a named alias named instead of
 * inlining its definition, which is what keeps the result readable.
 */
const SIGNATURE_FLAGS =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
  ts.TypeFormatFlags.WriteTypeArgumentsOfSignature

const DECLARED_TYPE_KINDS = new Set<SurfaceKind>(['interface', 'type'])

const typeOfSymbol = (
  symbol: ts.Symbol,
  kind: SurfaceKind,
  checker: ts.TypeChecker
): ts.Type | undefined => {
  if (DECLARED_TYPE_KINDS.has(kind)) return checker.getDeclaredTypeOfSymbol(symbol)
  const declaration = symbol.declarations?.[0]
  return declaration
    ? checker.getTypeOfSymbolAtLocation(symbol, declaration)
    : undefined
}

const printType = (
  type: ts.Type,
  location: ts.Node | undefined,
  checker: ts.TypeChecker
): string => checker.typeToString(type, location, SIGNATURE_FLAGS).replace(/\s+/g, ' ')

/**
 * The widest an expanded type may print before its name is the better answer.
 * A method verb or a content type says everything inline; a wiring object does
 * not, and expanding it buries the keys that matter in the ones that do not.
 */
const INLINE_LIMIT = 72

const EXPANDED_FLAGS =
  SIGNATURE_FLAGS & ~ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope

const NOT_TERMINAL = /[{}]|=>/

const collapse = (constituents: string[]): string[] => {
  const collapsed = constituents.includes('true') && constituents.includes('false')
    ? ['boolean', ...constituents.filter((c) => c !== 'true' && c !== 'false')]
    : constituents
  const isAbsent = (c: string) => c === 'undefined' || c === 'null'
  return [...collapsed.filter((c) => !isAbsent(c)), ...collapsed.filter(isAbsent)]
}

/**
 * A named type whose definition is a short union or an index signature costs a
 * reader a second lookup to learn something that fits on the line they are
 * already reading, so it is printed as its values rather than its name.
 */
const printResolved = (
  type: ts.Type,
  location: ts.Node | undefined,
  checker: ts.TypeChecker,
  optional = false
): string => {
  const constraint =
    type.flags & ts.TypeFlags.TypeParameter
      ? checker.getBaseConstraintOfType(type)
      : undefined
  if (constraint) {
    return printResolved(constraint, location, checker, optional)
  }
  const named = printType(type, location, checker)
  const expanded = type.isUnion()
    ? collapse(
        type.types.map((constituent) =>
          checker.typeToString(constituent, location, EXPANDED_FLAGS)
        )
      ).join(' | ')
    : checker.typeToString(type, location, EXPANDED_FLAGS).replace(/\s+/g, ' ')
  const shed = optional ? / \| undefined$/ : /(?!)/
  if (expanded === named || expanded.length > INLINE_LIMIT) {
    return named.replace(shed, '')
  }
  return (NOT_TERMINAL.test(expanded) ? named : expanded).replace(shed, '')
}

/**
 * A class prints as `typeof Foo`, which says nothing. Its construct signatures
 * are what a caller needs, so they stand in for it.
 */
const constructorSignature = (
  name: string,
  type: ts.Type,
  checker: ts.TypeChecker
): string | undefined => {
  const signatures = type.getConstructSignatures()
  if (signatures.length === 0) return undefined
  return signatures
    .map(
      (signature) =>
        `new ${name}(${signature
          .getParameters()
          .map((parameter) => {
            const declaration = parameter.valueDeclaration
            const parameterType = declaration
              ? checker.getTypeOfSymbolAtLocation(parameter, declaration)
              : checker.getTypeOfSymbol(parameter)
            const optional =
              declaration && ts.isParameter(declaration) && declaration.questionToken
                ? '?'
                : ''
            return `${parameter.getName()}${optional}: ${printResolved(parameterType, declaration, checker, optional === '?')}`
          })
          .join(', ')})`
    )
    .join(' | ')
}

const signatureOf = (
  name: string,
  type: ts.Type,
  kind: SurfaceKind,
  location: ts.Node | undefined,
  checker: ts.TypeChecker
): string | undefined => {
  const printed =
    kind === 'class'
      ? constructorSignature(name, type, checker)
      : printType(type, location, checker)
  if (!printed || printed === 'any' || printed === 'error' || printed === name)
    return undefined
  return collapseRuns(printed)
}

/**
 * One key of an options object: how it is written, and — where the declaring
 * type says so — what it means. `schedule: string` is a shape; "a cron
 * expression" is what a caller actually needs, and only the JSDoc has it.
 */
export type SurfaceMember = {
  line: string
  doc?: string
}

/**
 * A union parameterised by the project — every function name, every route —
 * is unbounded and belongs to `pikku meta`, not to a framework doc that is the
 * same for every project. Printed in full it buried one export under 4,000
 * tokens of another project's identifiers.
 */
const LITERAL_RUN = /("[^"]*"(?: \| "[^"]*"){7,})/g

const collapseRuns = (line: string): string =>
  line.replace(LITERAL_RUN, (run) => `${run.split(' | ').length} names (pikku meta)`)

/**
 * A key declared by the project rather than by the framework — the services in
 * its own `SingletonServices`, a type it wrote — is not part of the surface
 * every project shares. Left in, the doc built from the sample project told
 * every reader their singleton services hold a `todoStore`.
 */
const isProjectOwned = (declaration: ts.Declaration, root: string): boolean => {
  const file = declaration.getSourceFile().fileName
  return file.startsWith(root) && !file.includes('node_modules')
}

const memberLine = (
  property: ts.Symbol,
  checker: ts.TypeChecker,
  program: ts.Program,
  root: string
): SurfaceMember | undefined => {
  if (property.getName().startsWith('__')) return undefined
  const declaration = property.valueDeclaration ?? property.declarations?.[0]
  if (
    declaration &&
    (program.isSourceFileDefaultLibrary(declaration.getSourceFile()) ||
      isProjectOwned(declaration, root))
  ) {
    return undefined
  }
  const type = declaration
    ? checker.getTypeOfSymbolAtLocation(property, declaration)
    : checker.getTypeOfSymbol(property)
  const optional = property.flags & ts.SymbolFlags.Optional ? '?' : ''
  const doc = ts
    .displayPartsToString(property.getDocumentationComment(checker))
    .replace(/\s+/g, ' ')
    .trim()
  return {
    line: collapseRuns(
      `${property.getName()}${optional}: ${printResolved(type, declaration, checker, optional === '?')}`
    ),
    ...(doc ? { doc } : {}),
  }
}

/**
 * Every wiring and function helper takes one options object, so its signature
 * can only name that object's type and the keys someone has to write sit one
 * level below it. Anything else describes itself.
 */
const shapeOf = (
  type: ts.Type,
  kind: SurfaceKind,
  checker: ts.TypeChecker
): ts.Type | undefined => {
  if (kind === 'class') {
    return type.getConstructSignatures()[0]?.getReturnType()
  }
  if (kind !== 'function' && kind !== 'const') return type
  const signature = type.getCallSignatures()[0]
  if (!signature) return type
  for (const parameter of signature.getParameters()) {
    const declaration = parameter.valueDeclaration
    const parameterType = declaration
      ? checker.getTypeOfSymbolAtLocation(parameter, declaration)
      : checker.getTypeOfSymbol(parameter)
    if (checker.getPropertiesOfType(parameterType).length > 0) return parameterType
  }
  return undefined
}

const membersOf = (
  type: ts.Type,
  kind: SurfaceKind,
  checker: ts.TypeChecker,
  program: ts.Program,
  root: string
): SurfaceMember[] => {
  const shape = shapeOf(type, kind, checker)
  if (!shape) return []
  return checker
    .getPropertiesOfType(shape)
    .map((property) => memberLine(property, checker, program, root))
    .filter((member): member is SurfaceMember => member !== undefined)
    .sort((a, b) => a.line.localeCompare(b.line))
}

/**
 * `addError(SomeError, { status })` is a runtime registration, so nothing about
 * a class says what it maps to. The calls are top-level statements next to the
 * classes they register, which makes the mapping readable from the program the
 * surface is already walking rather than by importing and booting the runtime.
 */
const collectErrorStatuses = (program: ts.Program): Map<string, number> => {
  const statuses = new Map<string, number>()

  const record = (name: ts.Expression, details: ts.Expression): void => {
    if (!ts.isIdentifier(name) || !ts.isObjectLiteralExpression(details)) return
    for (const property of details.properties) {
      if (!ts.isPropertyAssignment(property)) continue
      if (property.name.getText() !== 'status') continue
      const status = Number(property.initializer.getText())
      if (Number.isFinite(status)) statuses.set(name.text, status)
    }
  }

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue
    for (const statement of sourceFile.statements) {
      if (!ts.isExpressionStatement(statement)) continue
      const call = statement.expression
      if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) continue
      if (call.expression.text === 'addError') {
        const [name, details] = call.arguments
        if (name && details) record(name, details)
        continue
      }
      if (call.expression.text !== 'addErrors') continue
      const [list] = call.arguments
      if (!list || !ts.isArrayLiteralExpression(list)) continue
      for (const entry of list.elements) {
        if (!ts.isArrayLiteralExpression(entry)) continue
        const [name, details] = entry.elements
        if (name && details) record(name, details)
      }
    }
  }

  return statuses
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
      ? expandWildcard(root, subpath, target, outDir)
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
  const errorStatuses = collectErrorStatuses(program)

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
      const docs = documentationOf(symbol, checker)
      const tags = jsDocTagsOf(symbol, checker)
      const name = symbol.getName()
      const target = aliasTargetOf(symbol, checker)
      const type = typeOfSymbol(target, kind, checker)
      const location = target.declarations?.[0]
      const examples = examplesOf(tags)
      const members = type ? membersOf(type, kind, checker, program, root) : []
      symbols.push({
        name,
        kind,
        declaredAt: file ? relative(root, file) : entry.entryFile,
        declaredIn: file,
        deprecated: isDeprecated(tags),
        deprecatedReason: deprecationReason(tags),
        summary: summaryOf(docs),
        docs,
        signature: type
          ? signatureOf(name, type, kind, location, checker)
          : undefined,
        members: members.length > 0 ? members : undefined,
        examples: examples.length > 0 ? examples : undefined,
        status: errorStatuses.get(name),
      })
    }

    return { ...entry, symbols }
  })
}
