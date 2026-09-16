import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { EXAMPLES, type PikkuExample } from '../../examples.gen.js'
import {
  entityNames,
  extractExampleApi,
  extractTeaching,
  renameActorsInCode,
  renameEntityInCode,
  renameEntityInPath,
  requiredChain,
  reservedEntityCollision,
  resolveExamplePath,
  scenarioRpcNames,
  splitExampleFiles,
  stripTeaching,
} from './corpus.js'
import {
  entityWriteCoverage,
  generatedTables,
  nearestTable,
  personaCast,
  registeredRpcs,
  resolveAppBase,
} from './project.js'
import type {
  ExamplesAddResult,
  ExamplesListResult,
  ExamplesShowResult,
} from './schemas.js'

export interface ExampleProject {
  rootDir: string
  outDir: string
  srcDirectories: string[]
}

const summary = (example: PikkuExample) => ({
  name: example.name,
  title: example.title,
  when: example.when,
  lang: example.lang,
  entity: example.entity,
  deferUntil: example.deferUntil,
})

export function runExamplesList(group?: string): ExamplesListResult {
  const examples = group
    ? EXAMPLES.filter((e) => e.name.startsWith(group))
    : [...EXAMPLES]
  return { examples: examples.map(summary) }
}

/** The project's own source directory a backend recipe's files are rebased onto. */
function functionsDirOf(project: ExampleProject): string {
  const first = project.srcDirectories[0]
  if (!first) return 'src'
  const rel = first.startsWith(project.rootDir)
    ? first.slice(project.rootDir.length).replace(/^[/\\]/, '')
    : first
  return rel.replace(/\\/g, '/').replace(/^\.\//, '') || 'src'
}

export function runExamplesShow(
  project: ExampleProject,
  name: string,
  entity?: string
): ExamplesShowResult {
  const empty = {
    name,
    title: '',
    when: '',
    source: '',
    steps: '',
    code: '',
    notes: [],
    available: EXAMPLES.map((e) => e.name),
  }
  const found = EXAMPLES.find((e) => e.name === name)
  if (!found) return { found: false, ...empty }

  const from = found.entity ? entityNames(found.entity) : null
  const to = entity ? entityNames(entity) : null
  const cast = personaCast(project.srcDirectories)
  const applyRename = (body: string) =>
    renameActorsInCode(
      from && to ? renameEntityInCode(body, from, to) : body,
      cast
    )

  return {
    found: true,
    ...empty,
    title: found.title,
    when: found.when,
    source: found.source,
    steps: found.steps ? applyRename(found.steps) : '',
    code: applyRename(stripTeaching(found.content)),
    notes: extractTeaching(found.content).map((note) => ({
      anchor: note.anchor ? applyRename(note.anchor) : null,
      lines: note.lines.map(applyRename),
    })),
  }
}

/** `ProductsComment` → `products_comment`, the name its migration has to declare. */
function snakeTable(pascal: string): string {
  return pascal.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

/**
 * The tables a file needs but this project has not generated zod for.
 *
 * The entity gate covers the table the example was asked for. A recipe may also reach for
 * a CHILD of it, and that table exists in no project until someone writes its migration.
 * Written anyway, both its imports resolve to `any` and codegen dies naming the file.
 */
function missingTables(body: string, tables: string[] | null): string[] {
  if (!tables || tables.length === 0) return []
  const imported =
    /import\s*\{([^}]+)\}\s*from\s*'#pikku\/db\/zod\.gen\.js'/.exec(body)?.[1]
  if (!imported) return []
  const wanted = new Set(
    imported
      .split(',')
      .map((name) =>
        name
          .trim()
          .split(/\s+as\s+/)[0]!
          .replace(/(InsertZ|PatchZ|Z)$/, '')
      )
      .filter(Boolean)
  )
  return [...wanted].filter((table) => !tables.includes(table))
}

const blank = (name: string, entity: string): ExamplesAddResult => ({
  ok: false,
  name,
  entity,
  refusal: '',
  written: [],
  kept: [],
  failed: [],
  deferred: [],
  manual: [],
  api: [],
  when: '',
  steps: '',
  notes: [],
})

const refuse = (
  name: string,
  entity: string,
  refusal: string
): ExamplesAddResult => ({
  ...blank(name, entity),
  refusal,
})

export function runExamplesAdd(
  project: ExampleProject,
  name: string,
  entity?: string,
  app?: string
): ExamplesAddResult {
  const found = EXAMPLES.find((e) => e.name === name)
  if (!found) {
    return refuse(
      name,
      entity ?? '',
      `No example named "${name}". Run \`pikku examples\` to see what there is.`
    )
  }

  // A pacing precondition, declared by the recipe rather than configured here: an app
  // whose schema promises tables nobody can create or edit yet does not need an AI
  // surface on top of it. Fails open when there is no schema to measure against.
  if (found.deferUntil === 'entity-write') {
    const { required, uncovered } = entityWriteCoverage(
      project.rootDir,
      project.srcDirectories
    )
    if (required.length > 0 && uncovered.length === required.length) {
      return refuse(
        name,
        entity ?? '',
        `"${name}" declares \`deferUntil: entity-write\`, and none of the ${required.length} table(s) this app's own migrations declare (${required.join(', ')}) has a create or edit path yet. Build one vertical's list + create + edit against a real \`insertInto\`/\`updateTable\` first, then run this again.`
      )
    }
  }

  if (found.entity && !entity) {
    return refuse(
      name,
      '',
      `"${name}" is written for an example \`${found.entity}\`, and is useless until it is renamed. Run it again with the domain word you mean: \`pikku examples add --name ${name} --entity <name>\`. It then writes its files already named for that entity.`
    )
  }

  const collision = entity ? reservedEntityCollision(entity) : null
  if (collision) {
    return refuse(
      name,
      entity ?? '',
      `"${entity}" is reserved — it collides with ${collision}, and the rename would write a table that clobbers it. Use the domain word you actually mean.`
    )
  }

  const target = resolveAppBase(project.rootDir, app)
  if (!target) {
    return refuse(
      name,
      entity ?? '',
      `There is no app called "${app}" under apps/. Drop --app to write into the primary one.`
    )
  }

  const from = found.entity ? entityNames(found.entity) : null
  const to = entity ? entityNames(entity) : null
  const cast = personaCast(project.srcDirectories)
  const renameCode = (body: string) =>
    renameActorsInCode(
      from && to ? renameEntityInCode(body, from, to) : body,
      cast
    )
  const renamePath = (path: string) =>
    from && to ? renameEntityInPath(path, from, to) : path

  const code = stripTeaching(found.content)
  const tables = code.includes('zod.gen')
    ? generatedTables(project.outDir)
    : null

  if (to && tables && tables.length > 0 && !tables.includes(to.pascal)) {
    const near = nearestTable(to.pascal, tables)
    const shown = tables
      .slice(0, 25)
      .map((t) => t[0]!.toLowerCase() + t.slice(1))
    return refuse(
      name,
      entity ?? '',
      `"${name}" builds its schemas from the \`${to.pascal}\` table zod, and this project has no such table — every one of its imports would resolve to \`any\` and fail codegen.\n` +
        (near
          ? `Did you mean \`--entity ${near[0]!.toLowerCase() + near.slice(1)}\`?`
          : `Tables it does have: ${shown.join(', ')}${tables.length > shown.length ? `, +${tables.length - shown.length} more` : ''}.\nUse one of those, or write the migration for "${to.camel}" first and run \`pikku db migrate\`.`)
    )
  }

  // A scenario is the one family that is a FORWARD reference: its steps name RPCs at the
  // type level, so a step naming one nobody has written is a type error the instant the
  // file lands — and while codegen is red nothing written afterwards registers.
  const wantedRpcs = scenarioRpcNames(renameCode(code))
  if (wantedRpcs.length > 0) {
    const registered = registeredRpcs(project.outDir)
    const missing = wantedRpcs.filter((rpc) => !registered.includes(rpc))
    if (registered.length > 0 && missing.length > 0) {
      const shown = registered.slice(0, 25)
      return refuse(
        name,
        entity ?? '',
        `"${name}" writes steps that call ${missing.map((r) => `\`${r}\``).join(', ')}, and this project has no such rpc. A scenario names its rpcs at the TYPE level, so the file would fail codegen the moment it lands.\n` +
          `Build the journey first, then come back for the scenario that proves it.\n` +
          `Rpcs it has today: ${shown.join(', ')}${registered.length > shown.length ? `, +${registered.length - shown.length} more` : ''}.`
      )
    }
  }

  const functionsDir = functionsDirOf(project)
  const { install: requiredNames, manual } = requiredChain(found.name, EXAMPLES)
  const requiredEntries = requiredNames
    .map((n) => EXAMPLES.find((e) => e.name === n))
    .filter((e): e is PikkuExample => e !== undefined)

  // Renamed AFTER the split, never before: a marker line and a body line want opposite
  // precedence for a one-word example, and renaming the whole blob first settles that the
  // wrong way for every destination path.
  const ownFiles = splitExampleFiles(code).map((f) => ({
    ...f,
    path: renamePath(f.path),
    body: renameCode(f.body),
  }))

  // A recipe with no `// ===== FILE:` marker has no ONE true destination — where a config
  // block or an auth hook belongs depends on the app. Those are read, not written.
  if (ownFiles.length === 0) {
    return refuse(
      name,
      entity ?? '',
      `"${name}" names no destination file — where it goes depends on how this app is laid out, so writing it would be a guess. Read it with \`pikku examples show --name ${name}${entity ? ` --entity ${entity}` : ''}\` and put it where it belongs.`
    )
  }

  const result = blank(name, entity ?? '')
  const install = (
    files: { path: string; body: string; overwrite?: boolean }[]
  ): void => {
    for (const file of files) {
      const absent = missingTables(file.body, tables)
      if (absent.length > 0) {
        result.deferred.push({
          path: file.path,
          tables: absent.map(snakeTable),
        })
        continue
      }
      const relative = resolveExamplePath(file.path, target.base, functionsDir)
      const destination = join(project.rootDir, relative)
      // Never clobber: a file the caller has since customised stays theirs, which is what
      // makes it safe to run this twice.
      if (existsSync(destination) && !file.overwrite) {
        if (
          !result.kept.includes(relative) &&
          !result.written.includes(relative)
        ) {
          result.kept.push(relative)
        }
        continue
      }
      try {
        mkdirSync(dirname(destination), { recursive: true })
        writeFileSync(destination, file.body)
        result.written.push(relative)
      } catch (err) {
        result.failed.push(
          `${relative} (${err instanceof Error ? err.message : String(err)})`
        )
      }
    }
  }

  const requiredFiles = requiredEntries.flatMap((e) =>
    splitExampleFiles(stripTeaching(e.content))
  )
  install(requiredFiles)
  install(ownFiles)

  const usable = new Set([...result.written, ...result.kept])
  result.api = [
    ...requiredEntries.flatMap((e) => splitExampleFiles(e.content)),
    ...splitExampleFiles(found.content).map((f) => ({
      path: renamePath(f.path),
      body: renameCode(f.body),
    })),
  ]
    .map((f) => ({
      path: resolveExamplePath(f.path, target.base, functionsDir),
      body: f.body,
    }))
    .filter((f) => usable.has(f.path) && !f.path.includes('.stories.'))
    .map((f) => ({ path: f.path, ...extractExampleApi(f.body) }))
    .filter((f) => f.exports.length > 0)

  result.manual = manual
  result.when = found.when
  result.steps = found.steps ? renameCode(found.steps) : ''
  result.notes = extractTeaching(found.content).map((note) => ({
    anchor: note.anchor ? renameCode(note.anchor) : null,
    lines: note.lines.map(renameCode),
  }))
  result.ok = result.failed.length === 0
  return result
}
