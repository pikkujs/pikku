import { join, relative } from 'node:path'

import type { Node } from '@typescript/native/unstable/ast'
import {
  isExportSpecifier,
  isParameterDeclaration,
} from '@typescript/native/unstable/ast/is'
import type { FileSystem } from '@typescript/native/unstable/fs'
import {
  API,
  SymbolFlags,
  SignatureKind,
  type Checker,
  type Project,
  type Symbol as ApiSymbol,
  type Type,
} from '@typescript/native/unstable/sync'

import {
  discoverEntrypoints,
  type CollectSurfaceOptions,
  type SurfaceEntrypoint,
  type SurfaceKind,
  type SurfaceMember,
  type SurfaceSymbol,
} from './collect-surface.js'

/**
 * `collectSurface` against the native compiler's API rather than the TypeScript
 * 6 compiler API. A spike: it answers what the port costs, not what it ships.
 *
 * Three things differ from the 6 implementation, and they are the whole point:
 *
 * - A program is a *project*, so it is opened by a tsconfig rather than built
 *   from a root-file list. The ad-hoc options 6 passes to `createProgram` are
 *   written into a synthetic tsconfig that only the client-side filesystem can
 *   see, so nothing is written to disk.
 * - A declaration is a `NodeHandle`, not a node. It resolves to one on demand,
 *   which fetches its whole source file across the wire the first time.
 * - Documentation and tags arrive rendered, so there is no `displayPartsToString`
 *   and the three lines around every JSDoc read collapse to one.
 */

/** The tsconfig the surface program is opened as. Never touches the disk. */
const SYNTHETIC_CONFIG = 'pikku-surface.ts7.tsconfig.json'

/**
 * The virtual filesystem `createVirtualFileSystem` does not give us: that one
 * answers "no" for every path it was not handed, which hides the real tree.
 * Returning `undefined` is what falls back to the real filesystem, so an
 * overlay has to be written by hand.
 */
const overlayFileSystem = (files: Record<string, string>): FileSystem => ({
  readFile: (fileName) => files[fileName],
  fileExists: (fileName) => (fileName in files ? true : undefined),
  directoryExists: () => undefined,
  getAccessibleEntries: () => undefined,
  realpath: () => undefined,
})

const KIND_BY_FLAG: Array<[SymbolFlags, SurfaceKind]> = [
  [SymbolFlags.Class, 'class'],
  [SymbolFlags.Interface, 'interface'],
  [SymbolFlags.RegularEnum | SymbolFlags.ConstEnum, 'enum'],
  [SymbolFlags.Function, 'function'],
  [SymbolFlags.TypeAlias, 'type'],
  [SymbolFlags.Namespace, 'namespace'],
]

const aliasTargetOf = (symbol: ApiSymbol, checker: Checker): ApiSymbol => {
  if (!(symbol.flags & SymbolFlags.Alias)) return symbol
  const target = checker.getAliasedSymbol(symbol)
  // 6 returns the symbol itself for an alias it cannot follow; 7 returns the
  // checker's unknown symbol, which has no declarations and no name worth
  // printing, so it has to be detected rather than used.
  return checker.isUnknownSymbol(target) ? symbol : target
}

/**
 * The node a handle stands for. Every declaration crosses the wire as a handle
 * — a (file, index) pair — and resolving one pulls the declaring source file
 * over in full, so a symbol whose declaration is never read costs nothing.
 */
const declarationOf = (
  symbol: ApiSymbol,
  project: Project
): Node | undefined => symbol.declarations[0]?.resolve(project)

const kindOf = (
  symbol: ApiSymbol,
  checker: Checker,
  project: Project
): SurfaceKind => {
  const target = aliasTargetOf(symbol, checker)

  for (const [flag, kind] of KIND_BY_FLAG) {
    if (target.flags & flag) return kind
  }

  if (target.flags & SymbolFlags.Variable) {
    const declaration = declarationOf(target, project)
    if (declaration) {
      const type = checker.getTypeOfSymbolAtLocation(target, declaration)
      if (checker.getSignaturesOfType(type, SignatureKind.Call).length > 0) {
        return 'function'
      }
    }
    return 'const'
  }

  return 'const'
}

const jsDocTagsOf = (symbol: ApiSymbol, checker: Checker) => {
  const own = checker.getJsDocTagsOfSymbol(symbol)
  if (own.length > 0) return own
  return checker.getJsDocTagsOfSymbol(aliasTargetOf(symbol, checker))
}

/**
 * A re-export the generator documents (`export type { Services }`) carries its
 * JSDoc on the export statement, which TypeScript attaches to no symbol at all
 * — so it is read off the node. 6 reaches it through `getJSDocCommentsAndTags`;
 * 7 has no such helper, but every node carries its own `jsDoc` array.
 */
const exportDeclarationDocumentationOf = (
  symbol: ApiSymbol,
  project: Project
): string | undefined => {
  for (const handle of symbol.declarations) {
    const declaration = handle.resolve(project)
    if (!declaration || !isExportSpecifier(declaration)) continue
    const statement = declaration.parent?.parent
    const comment = (statement?.jsDoc?.[0] as { comment?: unknown } | undefined)
      ?.comment
    // 6 flattens this with `getTextOfJSDocComment`. 7 exports no equivalent, so
    // the comment's parts — plain text and `{@link}` nodes — are joined here.
    const text =
      typeof comment === 'string'
        ? comment
        : Array.isArray(comment)
          ? comment
              .map((part: any) => part?.text ?? part?.getText?.() ?? '')
              .join('')
          : ''
    if (text.trim().length > 0) return text.trim()
  }
  return undefined
}

const documentationOf = (
  symbol: ApiSymbol,
  checker: Checker,
  project: Project
): string | undefined => {
  for (const target of [symbol, aliasTargetOf(symbol, checker)]) {
    const documentation = checker.getDocumentationCommentOfSymbol(target).trim()
    if (documentation.length > 0) return documentation
  }
  return exportDeclarationDocumentationOf(symbol, project)
}

const summaryOf = (documentation: string | undefined): string | undefined => {
  if (!documentation) return undefined
  return documentation
    .split(/\n\s*\n/)[0]!
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * `TypeFormatFlags` is not exported — `typeToString` takes a bare `number` —
 * so the bits are spelled out. `NoTruncation` is the load-bearing one: the
 * default cuts a type off at ~160 characters, mid-generics for every wiring
 * helper.
 */
const NO_TRUNCATION = 1
const WRITE_TYPE_ARGUMENTS_OF_SIGNATURE = 32
const USE_ALIAS_DEFINED_OUTSIDE_CURRENT_SCOPE = 16384

const SIGNATURE_FLAGS =
  NO_TRUNCATION |
  USE_ALIAS_DEFINED_OUTSIDE_CURRENT_SCOPE |
  WRITE_TYPE_ARGUMENTS_OF_SIGNATURE

const DECLARED_TYPE_KINDS = new Set<SurfaceKind>(['interface', 'type'])

const typeOfSymbol = (
  symbol: ApiSymbol,
  kind: SurfaceKind,
  checker: Checker,
  project: Project
): Type | undefined => {
  if (DECLARED_TYPE_KINDS.has(kind)) {
    const declared = checker.getDeclaredTypeOfSymbol(symbol)
    return declared.isErrorType() ? undefined : declared
  }
  const declaration = declarationOf(symbol, project)
  if (!declaration) return checker.getTypeOfSymbol(symbol)
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration)
  return type.isErrorType() ? undefined : type
}

const printType = (
  type: Type,
  location: Node | undefined,
  checker: Checker
): string => checker.typeToString(type, location, SIGNATURE_FLAGS)
  .replace(/\s+/g, ' ')

const constructorSignature = (
  name: string,
  type: Type,
  checker: Checker,
  project: Project
): string | undefined => {
  const signatures = checker.getSignaturesOfType(type, SignatureKind.Construct)
  if (signatures.length === 0) return undefined
  return signatures
    .map((signature) => {
      const parameters = signature.getParameters().map((parameter) => {
        const declaration = declarationOf(parameter, project)
        const parameterType = declaration
          ? checker.getTypeOfSymbolAtLocation(parameter, declaration)
          : checker.getTypeOfSymbol(parameter)
        const optional =
          declaration &&
          isParameterDeclaration(declaration) &&
          declaration.questionToken
            ? '?'
            : ''
        const printed = parameterType
          ? printType(parameterType, declaration, checker).replace(
              optional ? / \| undefined$/ : /(?!)/,
              ''
            )
          : 'unknown'
        return `${parameter.name}${optional}: ${printed}`
      })
      return `new ${name}(${parameters.join(', ')})`
    })
    .join(' | ')
}

const signatureOf = (
  name: string,
  type: Type,
  kind: SurfaceKind,
  location: Node | undefined,
  checker: Checker,
  project: Project
): string | undefined => {
  const printed =
    kind === 'class'
      ? constructorSignature(name, type, checker, project)
      : printType(type, location, checker)
  if (!printed || printed === 'any' || printed === 'error' || printed === name)
    return undefined
  return printed
}

const isProjectOwned = (declaration: Node, root: string): boolean => {
  const file = declaration.getSourceFile().fileName
  return file.startsWith(root) && !file.includes('node_modules')
}

const memberLine = (
  property: ApiSymbol,
  checker: Checker,
  project: Project,
  root: string
): SurfaceMember | undefined => {
  if (property.name.startsWith('__')) return undefined
  const declaration = declarationOf(property, project)
  if (
    declaration &&
    (project.program.isSourceFileDefaultLibrary(declaration.getSourceFile()) ||
      isProjectOwned(declaration, root))
  ) {
    return undefined
  }
  const type = declaration
    ? checker.getTypeOfSymbolAtLocation(property, declaration)
    : checker.getTypeOfSymbol(property)
  const optional = property.flags & SymbolFlags.Optional ? '?' : ''
  const doc = checker
    .getDocumentationCommentOfSymbol(property)
    .replace(/\s+/g, ' ')
    .trim()
  return {
    line: `${property.name}${optional}: ${
      type
        ? printType(type, declaration, checker).replace(
            optional ? / \| undefined$/ : /(?!)/,
            ''
          )
        : 'unknown'
    }`,
    ...(doc ? { doc } : {}),
  }
}

const shapeOf = (
  type: Type,
  kind: SurfaceKind,
  checker: Checker,
  project: Project
): Type | undefined => {
  if (kind === 'class') {
    const construct = checker.getSignaturesOfType(type, SignatureKind.Construct)
    const signature = construct[0]
    return signature ? checker.getReturnTypeOfSignature(signature) : undefined
  }
  if (kind !== 'function' && kind !== 'const') return type
  const signature = checker.getSignaturesOfType(type, SignatureKind.Call)[0]
  if (!signature) return type
  for (const parameter of signature.getParameters()) {
    const declaration = declarationOf(parameter, project)
    const parameterType = declaration
      ? checker.getTypeOfSymbolAtLocation(parameter, declaration)
      : checker.getTypeOfSymbol(parameter)
    if (!parameterType) continue
    if (checker.getPropertiesOfType(parameterType).length > 0)
      return parameterType
  }
  return undefined
}

const membersOf = (
  type: Type,
  kind: SurfaceKind,
  checker: Checker,
  project: Project,
  root: string
): SurfaceMember[] => {
  const shape = shapeOf(type, kind, checker, project)
  if (!shape) return []
  return checker
    .getPropertiesOfType(shape)
    .map((property) => memberLine(property, checker, project, root))
    .filter((member): member is SurfaceMember => member !== undefined)
    .sort((a, b) => a.line.localeCompare(b.line))
}

export const collectSurfaceTs7 = async (
  packageDir: string,
  options: CollectSurfaceOptions = {}
): Promise<SurfaceEntrypoint[]> => {
  const { root, paths, entries } = await discoverEntrypoints(packageDir, options)
  if (entries.length === 0) return []

  const configPath = join(root, SYNTHETIC_CONFIG)
  const config = {
    compilerOptions: {
      ...paths,
      target: 'esnext',
      module: 'node16',
      moduleResolution: 'node16',
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      types: [],
      allowJs: false,
      checkJs: false,
    },
    files: entries.map((entry) => join(root, entry.entryFile)),
  }

  const api = new API({
    cwd: root,
    fs: overlayFileSystem({ [configPath]: JSON.stringify(config) }),
  })

  try {
    const snapshot = api.updateSnapshot({ openProjects: [configPath] })
    const project = snapshot.getProject(configPath)
    if (!project) return []
    const { checker, program } = project

    return entries.map((entry) => {
      const sourceFile = program.getSourceFile(join(root, entry.entryFile))
      const moduleSymbol = sourceFile
        ? checker.getSymbolAtLocation(sourceFile)
        : undefined

      const symbols: SurfaceSymbol[] = []
      for (const symbol of moduleSymbol
        ? checker.getExportsOfModule(moduleSymbol)
        : []) {
        const kind = kindOf(symbol, checker, project)
        const target = aliasTargetOf(symbol, checker)
        const location = declarationOf(target, project)
        const file = location?.getSourceFile().fileName ?? null
        const docs = documentationOf(symbol, checker, project)
        const tags = jsDocTagsOf(symbol, checker)
        const type = typeOfSymbol(target, kind, checker, project)
        const examples = tags
          .filter((tag) => tag.name === 'example')
          .map((tag) => tag.text?.trim())
          .filter((text): text is string => !!text)
        const members = type
          ? membersOf(type, kind, checker, project, root)
          : []
        symbols.push({
          name: symbol.name,
          kind,
          declaredAt: file ? relative(root, file) : entry.entryFile,
          declaredIn: file,
          deprecated: tags.some((tag) => tag.name === 'deprecated'),
          summary: summaryOf(docs),
          docs,
          signature: type
            ? signatureOf(symbol.name, type, kind, location, checker, project)
            : undefined,
          members: members.length > 0 ? members : undefined,
          examples: examples.length > 0 ? examples : undefined,
        })
      }

      return { ...entry, symbols }
    })
  } finally {
    api.close()
  }
}
