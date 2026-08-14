/**
 * Emits `api-report.md`: every entry point's exported symbols with their full
 * type signatures.
 *
 * `public-surface.json` pins the *names* a consumer can reach, by reading
 * `Object.keys` off each entry point. That catches an export appearing or
 * disappearing and nothing else — adding a method to `MetaService`, or making
 * a field on `ChannelMeta` required, sails straight past it, and so does every
 * type-only export, which erases before there is an object to enumerate.
 *
 * Those are the changes that break a consumer's build, and the report's own
 * summary shows how many more of them there are than there are names.
 *
 * So this walks the type checker instead and writes what each symbol actually
 * *is*. The report is committed, and `api-report.test.ts` fails when the two
 * disagree — so a member-level change is a reviewable diff rather than a
 * surprise in someone else's CI.
 *
 * A member per line, and no member bodies. Both are load-bearing rather than
 * cosmetic: the report exists to be diffed, and a class emitted as one long
 * line of its own source is neither reviewable nor mergeable.
 *
 * Run: yarn api-report
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(
  readFileSync(resolve(packageRoot, 'package.json'), 'utf-8')
)

/**
 * A wildcard subpath stands for as many entry points as there are files behind
 * it, and the report is per entry point. Left as a pattern it resolves to no
 * source file at all, so every sub-barrel it publishes goes unreported.
 */
const expand = ([subpath, dist]: [string, string]): [string, string][] => {
  if (!subpath.includes('*')) return [[subpath, dist]]
  const [prefix] = dist.split('*') as [string]
  return readdirSync(
    resolve(packageRoot, prefix.replace('./dist/', './src/')),
    {
      recursive: true,
      encoding: 'utf-8',
    }
  )
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .map((file) => file.slice(0, -'.ts'.length))
    .sort()
    .map((area) => [subpath.replace('*', area), dist.replace('*', area)])
}

const entryPoints = Object.entries(pkg.exports as Record<string, string>)
  .flatMap(expand)
  .map(([subpath, dist]) => ({
    subpath,
    file: resolve(
      packageRoot,
      dist.replace('./dist/', './src/').replace(/\.js$/, '.ts')
    ),
  }))

const program = ts.createProgram(
  entryPoints.map((e) => e.file),
  {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.Node16,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    strict: true,
    skipLibCheck: true,
  }
)
const checker = program.getTypeChecker()

/** Comments are noise in a report the diff is read for. */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

/**
 * Punctuation that makes a line and its successor one thing.
 *
 * Read from both ends rather than one, because the closers are ambiguous from
 * behind: `string[]`, `Promise<T>` and `= {}` all end in a closing bracket and
 * none of them is a continuation. What the *next* line starts with is not.
 */
const CONTINUES = /(=>|[,;{([<|&=])$/
const CLOSES = /^(=>|extends\b|[}\])>,;|&])/

/**
 * A member's own text on one line — long, but never long enough to matter.
 *
 * Inside an object type the author's newline *was* the separator, so collapsing
 * without restoring it produces `{ a: string b: number }`, which is not the
 * type it describes and does not parse in the ```ts fence it is printed into.
 */
const oneLine = (text: string): string => {
  const lines = stripComments(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  let depth = 0
  const joined = lines
    .map((line, index) => {
      const inObjectType = depth > 0
      for (const character of line) {
        if (character === '{') depth++
        else if (character === '}') depth--
      }
      const next = lines[index + 1]
      return inObjectType &&
        next !== undefined &&
        !CONTINUES.test(line) &&
        !CLOSES.test(next)
        ? `${line};`
        : line
    })
    .join(' ')
  return joined.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
}

/**
 * A class member as a consumer sees it: the signature, and nothing after it.
 *
 * The body is where every character of this report used to come from — a class
 * arrived as its own source, so the report promised implementation details and
 * a one-word change to a method rewrote the whole declaration. Truncating at
 * the body leaves exactly the part a compatibility promise covers.
 */
const memberSignature = (member: ts.ClassElement | ts.TypeElement): string => {
  const source = member.getSourceFile().text
  const start = member.getStart()

  const body = (member as { body?: ts.Node }).body
  if (body) {
    const head = oneLine(source.slice(start, body.getStart())).replace(
      /\s*$/,
      ''
    )
    // An inferred return type is still a return type a consumer depends on, and
    // truncating at the body is what threw the author's away.
    if (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member)) {
      const signature = member.type
        ? undefined
        : checker.getSignatureFromDeclaration(member)
      if (signature) {
        const returns = checker.getReturnTypeOfSignature(signature)
        return `${head}: ${checker.typeToString(returns, undefined, ts.TypeFormatFlags.NoTruncation)}`
      }
    }
    return head
  }

  // A property's initializer is a body by another name. Its annotation stands in
  // for it, and the checker supplies one when the author left it inferred.
  if (ts.isPropertyDeclaration(member) && member.initializer) {
    if (member.type) return oneLine(source.slice(start, member.type.end))
    const type = checker.getTypeAtLocation(member)
    return `${oneLine(source.slice(start, member.name.end))}: ${checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)}`
  }

  return oneLine(member.getText())
}

/** Members a consumer can reach, so a private field is not a promise. */
const isPublic = (member: ts.ClassElement | ts.TypeElement): boolean =>
  !(ts.getModifiers(member as ts.HasModifiers) ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword
  ) && !(member.name && ts.isPrivateIdentifier(member.name))

/**
 * A declaration with members, one member per line.
 *
 * The line break is the point. Two branches that touch different methods of the
 * same class are a textual conflict when the class is one line and an ordinary
 * merge when it is not, which is a tax the whole repo was paying: every rebase
 * over this file stopped to re-resolve a forty-thousand-character line by hand.
 */
const membered = (
  declaration:
    | ts.ClassDeclaration
    | ts.InterfaceDeclaration
    | ts.EnumDeclaration,
  members: ts.NodeArray<ts.ClassElement | ts.TypeElement | ts.EnumMember>
): string => {
  if (members.length === 0) return oneLine(declaration.getText())
  const source = declaration.getSourceFile().text
  // `members.pos` is the offset just past the `{`, so the header comes with its
  // own brace and needs no reassembling.
  const header = oneLine(source.slice(declaration.getStart(), members.pos))
  const lines = ts.isEnumDeclaration(declaration)
    ? (members as readonly ts.EnumMember[]).map(
        (member) => `${oneLine(member.getText())},`
      )
    : (members as readonly (ts.ClassElement | ts.TypeElement)[])
        .filter(isPublic)
        .map(memberSignature)
  return [header, ...lines.map((line) => `  ${line}`), '}'].join('\n')
}

/** How a symbol is declared, in as many lines as its members need. */
const signature = (exported: ts.Symbol): string => {
  // A re-export is an alias; the declaration that matters is the target's, so
  // an interface re-exported through a barrel still reports its members.
  const symbol =
    exported.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(exported)
      : exported
  const declaration = symbol.declarations?.[0]
  if (!declaration) return exported.getName()

  if (
    ts.isClassDeclaration(declaration) ||
    ts.isInterfaceDeclaration(declaration) ||
    ts.isEnumDeclaration(declaration)
  ) {
    return membered(declaration, declaration.members)
  }

  if (ts.isTypeAliasDeclaration(declaration)) {
    // No members to walk, so the author's own line breaks are the ones that
    // keep a long union reviewable.
    return stripComments(declaration.getText())
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.trim())
      .join('\n')
  }

  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration)
  return `${exported.getName()}: ${checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)}`
}

/**
 * Entry points whose signatures move with the CLI's codegen. Everything else
 * is what an application imports, and is what a compatibility promise covers.
 *
 * knowledge: decisions/internals/the-ecosystem-entry-point-carries-the-adapter-surface.md
 */
const isEcosystem = (subpath: string) =>
  subpath === './ecosystem' ||
  subpath === './internal' ||
  subpath.startsWith('./ecosystem/')

type Exported = { name: string; members: number; signature: string }

/** The members the report lists, which is what the tally is counting. */
const memberCount = (declaration: ts.Declaration): number => {
  if (ts.isInterfaceDeclaration(declaration)) return declaration.members.length
  if (ts.isEnumDeclaration(declaration)) return declaration.members.length
  if (!ts.isClassDeclaration(declaration)) return 0
  return declaration.members.filter(isPublic).length
}

const modules = new Map<string, Exported[]>()

for (const { subpath, file } of entryPoints) {
  const source = program.getSourceFile(file)
  if (!source) continue
  const moduleSymbol = checker.getSymbolAtLocation(source)
  if (!moduleSymbol) continue

  modules.set(
    subpath,
    checker
      .getExportsOfModule(moduleSymbol)
      .map((exported) => {
        const symbol =
          exported.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(exported)
            : exported
        const declaration = symbol.declarations?.[0]
        return {
          name: exported.getName(),
          members: declaration ? memberCount(declaration) : 0,
          signature: signature(exported),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  )
}

// A name reachable from more than one entry point is counted once, against the
// weaker promise — reaching it through a stable subpath is what a consumer will
// have done, whatever else also exports it.
const tierOf = new Map<string, string>()
const membersOf = new Map<string, number>()
for (const [subpath, exports] of modules) {
  const tier = isEcosystem(subpath) ? 'ecosystem' : 'stable'
  for (const { name, members } of exports) {
    if (tier === 'stable' || !tierOf.has(name)) tierOf.set(name, tier)
    membersOf.set(name, Math.max(membersOf.get(name) ?? 0, members))
  }
}

const tally = (tier: string) => {
  const names = [...tierOf].filter(([, t]) => t === tier).map(([n]) => n)
  return {
    entryPoints: [...modules.keys()].filter(
      (s) => (isEcosystem(s) ? 'ecosystem' : 'stable') === tier
    ).length,
    names: names.length,
    members: names.reduce((total, n) => total + (membersOf.get(n) ?? 0), 0),
  }
}
const stable = tally('stable')
const ecosystem = tally('ecosystem')
const observable =
  stable.names + stable.members + ecosystem.names + ecosystem.members

const reachableFrom = new Map<string, number>()
for (const exports of modules.values())
  for (const { name } of exports)
    reachableFrom.set(name, (reachableFrom.get(name) ?? 0) + 1)

const perEntryPoint = [...modules]
  .map(([subpath, exports]) => {
    const exclusive = exports.filter(
      ({ name }) => reachableFrom.get(name) === 1
    )
    return {
      subpath,
      exports: exports.length,
      exclusive: exclusive.length,
      members: exclusive.reduce((total, e) => total + e.members, 0),
    }
  })
  .sort((a, b) => b.exclusive + b.members - (a.exclusive + a.members))

const sections: string[] = [
  '# @pikku/core API report',
  '',
  'Generated by `yarn api-report`. Every exported symbol with its full',
  'signature, so a member-level change is a reviewable diff. Do not edit.',
  '',
  '## What a compatibility promise covers',
  '',
  `**${observable} observable things**: ${stable.names + ecosystem.names} exported names, plus`,
  `${stable.members + ecosystem.members} members on the classes and interfaces among them.`,
  '',
  '| tier | entry points | names | members |',
  '| --- | ---: | ---: | ---: |',
  `| stable | ${stable.entryPoints} | ${stable.names} | ${stable.members} |`,
  `| ecosystem | ${ecosystem.entryPoints} | ${ecosystem.names} | ${ecosystem.members} |`,
  '',
  'An entry point whose exports are mostly *exclusive* is a self-contained',
  'subsystem rather than shared machinery — which tends to mean a newer one.',
  '',
  '| entry point | exports | exclusive | members on those |',
  '| --- | ---: | ---: | ---: |',
  ...perEntryPoint.map(
    (e) => `| \`${e.subpath}\` | ${e.exports} | ${e.exclusive} | ${e.members} |`
  ),
  '',
]

for (const [subpath, exports] of modules) {
  sections.push(`## ${subpath}`, '')
  sections.push('```ts')
  for (const { signature } of exports) sections.push(signature)
  sections.push('```', '')
}

writeFileSync(resolve(packageRoot, 'api-report.md'), sections.join('\n'))
console.log(`api-report.md written for ${entryPoints.length} entry points`)
