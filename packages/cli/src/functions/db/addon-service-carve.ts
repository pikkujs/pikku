import ts from 'typescript'
import { basename, dirname, resolve, join } from 'node:path'

/** Base services the host always provides; never re-declared by the addon. */
const BASE_SERVICES = new Set([
  'config',
  'logger',
  'variables',
  'secrets',
  'schema',
])

export interface ServiceCarveResult {
  /** application-types member lines, e.g. `  email: EmailService`. */
  members: string[]
  /** import lines for application-types. */
  imports: string[]
  /** type files to ship with the addon, keyed `types/<basename>`. */
  files: Record<string, string>
  /** packages to add as peer/dev deps (services typed via an external package). */
  packages: string[]
  /** services whose type couldn't be carved cleanly — caller gates. */
  unsupported: string[]
}

/** The source project's `SingletonServices` interface + the file declaring it (body members are the user services). */
function findSingletonServices(
  program: ts.Program
): { decl: ts.InterfaceDeclaration; sourceFile: ts.SourceFile } | null {
  for (const sf of program.getSourceFiles()) {
    if (sf.fileName.includes('/node_modules/')) continue
    for (const st of sf.statements) {
      if (ts.isInterfaceDeclaration(st) && st.name.text === 'SingletonServices') {
        return { decl: st, sourceFile: sf }
      }
    }
  }
  return null
}

/** Map of `imported type name -> module specifier` for a source file's named imports. */
function importMap(sf: ts.SourceFile): Map<string, string> {
  const map = new Map<string, string>()
  for (const st of sf.statements) {
    if (
      ts.isImportDeclaration(st) &&
      st.importClause?.namedBindings &&
      ts.isNamedImports(st.importClause.namedBindings) &&
      ts.isStringLiteral(st.moduleSpecifier)
    ) {
      for (const el of st.importClause.namedBindings.elements) {
        map.set(el.name.text, st.moduleSpecifier.text)
      }
    }
  }
  return map
}

/** Resolve a relative module specifier (as written, `.js`-suffixed) to a program source file. */
function resolveLocal(
  program: ts.Program,
  fromFile: string,
  spec: string
): ts.SourceFile | null {
  const dir = dirname(fromFile)
  const base = spec.replace(/\.js$/, '')
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.d.ts`,
    join(base, 'index.ts'),
  ].map((c) => resolve(dir, c))
  for (const sf of program.getSourceFiles()) {
    if (candidates.includes(resolve(sf.fileName))) return sf
  }
  return null
}

/** Type-reference names used inside a type node. */
function collectTypeRefs(node: ts.TypeNode): string[] {
  const names = new Set<string>()
  const visit = (n: ts.Node) => {
    if (ts.isTypeReferenceNode(n)) {
      const tn = n.typeName
      names.add(ts.isIdentifier(tn) ? tn.text : tn.right.text)
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return [...names]
}

/** A declaring file is safe to copy verbatim only if it has no relative imports to chase. */
function hasRelativeImports(sf: ts.SourceFile): boolean {
  return sf.statements.some(
    (st) =>
      (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) &&
      st.moduleSpecifier !== undefined &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      st.moduleSpecifier.text.startsWith('.')
  )
}

/** Drop the module extension from a copied type file to form its import specifier. */
function moduleName(fileName: string): string {
  return basename(fileName).replace(/\.d\.ts$|\.tsx?$/, '')
}

/** The installable package name from a (possibly sub-pathed) module specifier. */
function packageName(spec: string): string {
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
}

/**
 * Carve the user-defined (non-base, non-kysely) services the bundled functions
 * use into the addon: copy each service's declaring type file and emit the
 * application-types member + import so the addon's `pikkuAddonServices` factory
 * type-checks against the same service types as the source.
 *
 * The service type is resolved through the source `application-types` imports —
 * NOT by name — so a type sharing a name with one in a dependency (e.g. core's
 * own `EmailService`) can't be picked up by mistake. Each referenced type is
 * carved by origin:
 *   - global/library type        → used as-is (no copy, no import)
 *   - external-package type      → re-imported from the package, which is added
 *                                  as a peer/dev dep (same as the kysely path)
 *   - self-contained local file  → copied into the addon and imported
 *   - sibling-importing local    → unsupported (transitive copy not chased)
 * A service is supported unless one of its types is a transitive local file.
 */
export function carveServiceTypes(
  program: ts.Program,
  requiredServices: string[]
): ServiceCarveResult {
  const wanted = new Set(
    requiredServices.filter((s) => !BASE_SERVICES.has(s) && s !== 'kysely')
  )
  const result: ServiceCarveResult = {
    members: [],
    imports: [],
    files: {},
    packages: [],
    unsupported: [],
  }
  if (wanted.size === 0) return result

  const singleton = findSingletonServices(program)
  if (!singleton) {
    result.unsupported = [...wanted]
    return result
  }
  const { decl, sourceFile: appTypesFile } = singleton
  const imports = importMap(appTypesFile)
  const importByModule = new Map<string, Set<string>>()
  const packages = new Set<string>()

  for (const member of decl.members) {
    if (
      !ts.isPropertySignature(member) ||
      !member.type ||
      !member.name ||
      !ts.isIdentifier(member.name)
    ) {
      continue
    }
    const service = member.name.text
    if (!wanted.has(service)) continue

    const typeText = member.type.getText(appTypesFile)
    // Imports this service's declaration needs, by module specifier.
    const refImports = new Map<string, Set<string>>()
    const toCopy: { sf: ts.SourceFile; name: string }[] = []
    const pkgDeps: string[] = []
    let ok = true

    const addRefImport = (mod: string, name: string) => {
      if (!refImports.has(mod)) refImports.set(mod, new Set())
      refImports.get(mod)!.add(name)
    }

    for (const ref of collectTypeRefs(member.type)) {
      const spec = imports.get(ref)
      if (!spec) continue // not imported → global/library type, nothing to do
      if (!spec.startsWith('.')) {
        // External package: re-import from it, add the package as a dep.
        addRefImport(spec, ref)
        pkgDeps.push(packageName(spec))
        continue
      }
      const sf = resolveLocal(program, appTypesFile.fileName, spec)
      if (!sf || hasRelativeImports(sf)) {
        ok = false // transitive local file — not chased
        break
      }
      toCopy.push({ sf, name: ref })
    }
    if (!ok) {
      result.unsupported.push(service)
      continue
    }

    for (const { sf, name } of toCopy) {
      result.files[`types/${basename(sf.fileName)}`] = sf.text
      addRefImport(`./${moduleName(sf.fileName)}.js`, name)
    }
    for (const [mod, names] of refImports) {
      if (!importByModule.has(mod)) importByModule.set(mod, new Set())
      for (const n of names) importByModule.get(mod)!.add(n)
    }
    for (const p of pkgDeps) packages.add(p)
    result.members.push(`  ${service}: ${typeText}`)
  }

  for (const [mod, names] of importByModule) {
    result.imports.push(
      `import type { ${[...names].sort().join(', ')} } from '${mod}'`
    )
  }
  result.packages = [...packages].sort()
  return result
}
