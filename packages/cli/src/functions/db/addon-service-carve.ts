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
  /** services whose type couldn't be carved cleanly — caller warns. */
  unsupported: string[]
}

/** The source project's `SingletonServices` interface (its body members are the user services). */
function findSingletonServices(
  program: ts.Program
): ts.InterfaceDeclaration | null {
  for (const sf of program.getSourceFiles()) {
    if (sf.fileName.includes('/node_modules/')) continue
    for (const st of sf.statements) {
      if (ts.isInterfaceDeclaration(st) && st.name.text === 'SingletonServices') {
        return st
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

/**
 * Carve the user-defined (non-base, non-kysely) services the bundled functions
 * use into the addon: copy each service's declaring type file and emit the
 * application-types member + import so the addon's `pikkuAddonServices` factory
 * type-checks against the same service types as the source.
 *
 * The service type is resolved through the source `application-types` imports —
 * NOT by name — so a type sharing a name with one in a dependency (e.g. core's
 * own `EmailService`) can't be picked up by mistake. A service is supported when
 * every type its declaration references resolves to a self-contained local file
 * (no relative imports) or to a global/library type. Services typed via an
 * external package or a transitive local file are reported as unsupported.
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
    unsupported: [],
  }
  if (wanted.size === 0) return result

  const singleton = findSingletonServices(program)
  if (!singleton) {
    result.unsupported = [...wanted]
    return result
  }
  const appTypesFile = singleton.getSourceFile()
  const imports = importMap(appTypesFile)
  const importByModule = new Map<string, Set<string>>()

  for (const member of singleton.members) {
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
    const toCopy: { sf: ts.SourceFile; name: string }[] = []
    let ok = true

    for (const ref of collectTypeRefs(member.type)) {
      const spec = imports.get(ref)
      if (!spec) continue // not imported → global/library type, no copy needed
      if (!spec.startsWith('.')) {
        ok = false // typed via an external package — can't carve cleanly
        break
      }
      const sf = resolveLocal(program, appTypesFile.fileName, spec)
      if (!sf || hasRelativeImports(sf)) {
        ok = false
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
      const mod = `./${moduleName(sf.fileName)}.js`
      if (!importByModule.has(mod)) importByModule.set(mod, new Set())
      importByModule.get(mod)!.add(name)
    }
    result.members.push(`  ${service}: ${typeText}`)
  }

  for (const [mod, names] of importByModule) {
    result.imports.push(
      `import type { ${[...names].sort().join(', ')} } from '${mod}'`
    )
  }
  return result
}
