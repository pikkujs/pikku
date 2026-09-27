import type { PikkuExample } from '../../examples.gen.js'

/**
 * Strip the `//~` teaching comments so what lands on disk is clean code.
 *
 * Keeps a code line that carries a trailing `//~` by removing just the comment; drops a
 * line that is entirely one. This is what lets a recipe be heavily annotated for whoever
 * reads it while the file it writes has no comments in it at all.
 */
export function stripTeaching(content: string): string {
  const out: string[] = []
  for (const line of content.split('\n')) {
    if (line.trim().startsWith('//~')) continue
    out.push(line.replace(/\s*\/\/~.*$/, ''))
  }
  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

/** A run of `//~` teaching, and the code line it was written against. */
export interface ExampleNote {
  /** The line the prose annotates, trimmed; null for prose that opens a file. */
  anchor: string | null
  lines: string[]
}

/**
 * Every `//~` teaching line in a recipe, paired with the code it annotates.
 *
 * The anchor is what makes a flat dump readable: prose like "swap this for your own list
 * RPC" means nothing on its own and everything beside the line it points at. The leading
 * header block is skipped by the same rule the header parser uses, so `name`, `when` and
 * `steps:` are never repeated here.
 */
export function extractTeaching(content: string): ExampleNote[] {
  const lines = content.split('\n')
  let i = 0
  while (i < lines.length) {
    const t = lines[i]!.trim()
    if (t === '' || t.startsWith('//~')) i++
    else break
  }
  const notes: ExampleNote[] = []
  let run: string[] = []
  const flush = (anchor: string | null) => {
    if (run.length === 0) return
    notes.push({ anchor, lines: run })
    run = []
  }
  for (; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trim()
    if (trimmed.startsWith('//~')) {
      run.push(trimmed.replace(/^\/\/~ ?/, ''))
      continue
    }
    if (trimmed === '') continue
    const marker = FILE_MARKER.exec(line)
    const code = line.replace(/\s*\/\/~.*$/, '').trim()
    const trailing = line.match(/\/\/~\s?(.*)$/)
    flush(marker ? marker[1]!.trim() : code || null)
    if (trailing)
      notes.push({ anchor: code || null, lines: [trailing[1]!.trim()] })
  }
  flush(null)
  return notes.filter((n) => n.lines.some((l) => l.trim() !== ''))
}

export interface ExampleFile {
  path: string
  body: string
  /**
   * `(overwrite)` on the marker line. The default is never-clobber, which is right for a
   * file the caller may have customised; a recipe that REPLACES a shipped file says so.
   */
  overwrite: boolean
}

const FILE_MARKER = /^\/\/ ===== FILE: (.+?) =====\s*$/

export function splitExampleFiles(content: string): ExampleFile[] {
  const files: ExampleFile[] = []
  let current: { path: string; overwrite: boolean; lines: string[] } | null =
    null
  const flush = () => {
    if (!current) return
    files.push({
      path: current.path,
      overwrite: current.overwrite,
      body: current.lines.join('\n').trim() + '\n',
    })
  }
  for (const line of content.split('\n')) {
    const marker = FILE_MARKER.exec(line)
    if (marker) {
      flush()
      const raw = marker[1]!.trim()
      const overwrite = raw.endsWith('(overwrite)')
      current = {
        path: (overwrite ? raw.slice(0, -'(overwrite)'.length) : raw).trim(),
        overwrite,
        lines: [],
      }
      continue
    }
    if (current) current.lines.push(line)
  }
  flush()
  return files
}

/**
 * Where a recipe's file lands, relative to the project root.
 *
 * A marker path beginning `src/` is FRONTEND-relative; one beginning
 * `packages/functions/src/` is backend, and is rebased onto whatever this project calls
 * its source directory — the starter template keeps functions in a workspace package and
 * a single-package project keeps them at `src/`, and a recipe should not have to know
 * which. Anything else is taken from the project root as written.
 */
export function resolveExamplePath(
  path: string,
  appBase: string,
  functionsDir: string
): string {
  if (path.startsWith('src/')) return `${appBase}/${path}`
  const backend = 'packages/functions/src/'
  if (path.startsWith(backend))
    return `${functionsDir}/${path.slice(backend.length)}`
  return path
}

/** The three spellings a recipe spells its domain symbol in. */
export interface EntityNames {
  /** `sessionNote` — identifiers, RPC names. */
  camel: string
  /** `SessionNote` — types, generated zod (`SessionNoteZ`), components. */
  pascal: string
  /** `session-note` — file names and route paths. */
  kebab: string
}

function words(raw: string): string[] {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
}

export function entityNames(raw: string): EntityNames {
  const parts = words(raw)
  const pascal = parts.map((w) => w[0]!.toUpperCase() + w.slice(1)).join('')
  return {
    camel: pascal[0] ? pascal[0].toLowerCase() + pascal.slice(1) : '',
    pascal,
    kebab: parts.join('-'),
  }
}

/**
 * Entity names the stack already owns, with what each one would collide with.
 *
 * The rename lands a `CREATE TABLE <entity>` in a migration, so `--entity session` does
 * not produce a second table — it collides with Better Auth's session store and breaks
 * login. Deliberately a refusal rather than an auto-prefix: the caller has to pick the
 * domain word they actually mean, and a silent rewrite would hand back files named for
 * something they never asked for.
 */
export const RESERVED_ENTITY_NAMES = new Map<string, string>([
  ['session', "Better Auth's session store"],
  ['user', "Better Auth's user table"],
  ['account', "Better Auth's account table"],
  ['verification', "Better Auth's verification table"],
  ['credentials', 'the pikku credentials table'],
  ['secrets', 'the pikku secrets table'],
  ['channels', 'the pikku channels table'],
  ['workflow', "the pikku runtime's workflow tables"],
  ['services', 'the services/ directory'],
  ['addons', 'the addons/ directory'],
  ['lib', 'the lib/ directory'],
  ['functions', 'the functions/ directory'],
  ['workflows', 'the workflows/ directory'],
  ['wires', 'the wires/ directory'],
])

/** What `--entity <raw>` would collide with, or null when the name is free to use. */
export function reservedEntityCollision(raw: string): string | null {
  return RESERVED_ENTITY_NAMES.get(entityNames(raw).camel.toLowerCase()) ?? null
}

/**
 * Rewrite a recipe from its example domain into the caller's real one.
 *
 * Substring replacement, deliberately not word-bounded: the generated zod for a table is
 * `<Pascal>Z` and its id field `<camel>Id`, so a trailing boundary would leave `TodoZ`
 * and `todoId` behind in a file otherwise renamed — a mix that type-checks against
 * neither table. The cost is that the example name occurring inside an unrelated word is
 * also rewritten, which is why example names are chosen to be distinctive.
 *
 * `order` exists because a SINGLE-WORD example spells its camel and kebab forms
 * identically (`todo`) while the two map to different replacements (`sessionNote` vs
 * `session-note`). Code wants the identifier; a file path wants the hyphenated name.
 */
function rename(
  content: string,
  from: EntityNames,
  to: EntityNames,
  order: (keyof EntityNames)[]
): string {
  let out = content
  for (const form of order) {
    const needle = from[form]
    if (!needle || needle === to[form]) continue
    out = out.split(needle).join(to[form])
  }
  return out
}

export function renameEntityInCode(
  content: string,
  from: EntityNames,
  to: EntityNames
): string {
  return rename(content, from, to, ['pascal', 'camel', 'kebab'])
}

export function renameEntityInPath(
  path: string,
  from: EntityNames,
  to: EntityNames
): string {
  return rename(path, from, to, ['kebab', 'pascal', 'camel'])
}

/**
 * Point an example's `actors.<id>` at somebody this project actually declares.
 *
 * A browser step's actor has to be a literal `actors.<name>`, so every scenario recipe
 * names one — and a persona that does not exist fails codegen, which stops everything
 * written afterwards from registering. Distinct unknown ids map to distinct personas in
 * declaration order, so a two-colleague example keeps its two colleagues, and saturate
 * on the last one when the cast is smaller.
 */
export function renameActorsInCode(content: string, cast: string[]): string {
  if (cast.length === 0) return content
  const declared = new Set(cast)
  const chosen = new Map<string, string>()
  return content.replace(
    /\bactors(\??\.)([A-Za-z_$][\w$]*)/g,
    (all, dot: string, id: string) => {
      if (declared.has(id)) return all
      let to = chosen.get(id)
      if (to === undefined) {
        to = cast[Math.min(chosen.size, cast.length - 1)]!
        chosen.set(id, to)
      }
      return `actors${dot}${to}`
    }
  )
}

const SCENARIO_STEP =
  /\bscenario\.(?:do|expectEventually|expectError)\(\s*(?:'[^']*'|"[^"]*"|`[^`]*`)\s*,\s*'([^']+)'/g

/**
 * Every RPC a scenario recipe's steps call BY NAME, after the entity rename.
 *
 * A scenario is the one family that is a FORWARD REFERENCE: codegen auto-discovers every
 * `*.scenario.ts` and types `scenario.do`'s second argument as the union of registered
 * RPCs, so a step naming one that does not exist yet is a type error the moment the file
 * lands — and while codegen is red nothing written after it registers.
 */
export function scenarioRpcNames(body: string): string[] {
  const names = new Set<string>()
  for (const [, rpc] of body.matchAll(SCENARIO_STEP)) names.add(rpc)
  return [...names]
}

/** What a written file offers whatever imports it. */
export interface ExampleApi {
  exports: string[]
  /** The `Props` (and transitively referenced) type declarations, verbatim. */
  declarations: string[]
}

const EXPORTED_SYMBOL = /^export (?:function|const|class) (\w+)/gm
const TYPE_DECL =
  /^(?:export )?(?:interface|type) (\w+)(<[^>]*>)?\s*(?:=\s*)?\{/gm

/**
 * The API of a written file, taken from its source rather than described by hand.
 *
 * A recipe that WRITES its files leaves the caller holding filenames and nothing else —
 * they have not seen a single prop, and buy them back one file read at a time.
 * Declarations come back verbatim, teaching comments included, because the comment is
 * routinely the part a type cannot express.
 */
export function extractExampleApi(body: string): ExampleApi {
  const exports = [...body.matchAll(EXPORTED_SYMBOL)].map((m) => m[1]!)
  const blocks = new Map<string, string>()
  for (const match of body.matchAll(TYPE_DECL)) {
    const block = balancedBlock(body, match.index! + match[0].length - 1)
    if (block) blocks.set(match[1]!, `${match[0].slice(0, -1).trim()} ${block}`)
  }
  const wanted = new Set<string>()
  const queue = exports
    .map((name) => `${name}Props`)
    .filter((name) => blocks.has(name))
  while (queue.length > 0) {
    const name = queue.shift()!
    if (wanted.has(name)) continue
    wanted.add(name)
    for (const other of blocks.keys()) {
      if (
        !wanted.has(other) &&
        new RegExp(`\\b${other}\\b`).test(blocks.get(name)!)
      ) {
        queue.push(other)
      }
    }
  }
  return { exports, declarations: [...wanted].map((name) => blocks.get(name)!) }
}

function balancedBlock(source: string, open: number): string | null {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0)
      return source.slice(open, i + 1)
  }
  return null
}

/**
 * The recipes that must be written before this one, dependencies first.
 *
 * A recipe that declares an example entity is NOT installed unattended — the rename is
 * the whole point of it, and guessing the caller's domain word would write the example
 * one into their app. Those come back as `manual` so the caller can be told to run each
 * with the entity it is for.
 */
export function requiredChain(
  name: string,
  entries: readonly PikkuExample[]
): { install: string[]; manual: string[]; missing: string[] } {
  const byName = new Map(entries.map((e) => [e.name, e]))
  const install: string[] = []
  const manual: string[] = []
  const missing: string[] = []
  const seen = new Set<string>([name])

  const walk = (current: string): void => {
    for (const required of byName.get(current)?.requires ?? []) {
      if (seen.has(required)) continue
      seen.add(required)
      const node = byName.get(required)
      if (!node) {
        missing.push(required)
        continue
      }
      walk(required)
      if (node.entity) manual.push(required)
      else install.push(required)
    }
  }

  walk(name)
  return { install, manual, missing }
}
