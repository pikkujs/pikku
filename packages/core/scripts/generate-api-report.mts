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
 * Run: yarn api-report
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(
  readFileSync(resolve(packageRoot, 'package.json'), 'utf-8')
)

const entryPoints = Object.entries(pkg.exports as Record<string, string>).map(
  ([subpath, dist]) => ({
    subpath,
    file: resolve(
      packageRoot,
      dist.replace('./dist/', './src/').replace(/\.js$/, '.ts')
    ),
  })
)

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

/** One line per symbol: how it is declared, flattened and stripped of noise. */
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
    ts.isInterfaceDeclaration(declaration) ||
    ts.isClassDeclaration(declaration) ||
    ts.isTypeAliasDeclaration(declaration) ||
    ts.isEnumDeclaration(declaration)
  ) {
    // The declaration itself, so member changes show up in the diff.
    return declaration
      .getText()
      .replace(/\/\*\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' ')
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
const ECOSYSTEM_SUBPATHS = new Set(['./ecosystem', './internal'])

type Exported = { name: string; members: number; signature: string }

/** Members a consumer can reach, so a private field is not a promise. */
const memberCount = (declaration: ts.Declaration): number => {
  if (ts.isInterfaceDeclaration(declaration)) return declaration.members.length
  if (ts.isEnumDeclaration(declaration)) return declaration.members.length
  if (!ts.isClassDeclaration(declaration)) return 0
  return declaration.members.filter(
    (member) =>
      !(ts.getModifiers(member) ?? []).some(
        (modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword
      ) && !(member.name && ts.isPrivateIdentifier(member.name))
  ).length
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
  const tier = ECOSYSTEM_SUBPATHS.has(subpath) ? 'ecosystem' : 'stable'
  for (const { name, members } of exports) {
    if (tier === 'stable' || !tierOf.has(name)) tierOf.set(name, tier)
    membersOf.set(name, Math.max(membersOf.get(name) ?? 0, members))
  }
}

const tally = (tier: string) => {
  const names = [...tierOf].filter(([, t]) => t === tier).map(([n]) => n)
  return {
    entryPoints: [...modules.keys()].filter(
      (s) => (ECOSYSTEM_SUBPATHS.has(s) ? 'ecosystem' : 'stable') === tier
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
