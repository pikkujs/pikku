import type {
  KnowledgeGapsResult,
  KnowledgeIndexResult,
  KnowledgePlanDeferResult,
  KnowledgePlanProgressResult,
  KnowledgePlanSchemaResult,
  KnowledgePlanSetResult,
  KnowledgePlanShowResult,
  KnowledgeValidateResult,
} from '@pikku/knowledge'
import { added, changed, dim, removed } from '../../fabric/lib/output.js'

const ORPHANS_SHOWN = 10

export const renderKnowledgeValidate = (
  _services: unknown,
  { ok, notes, findings }: KnowledgeValidateResult
): void => {
  const errors = findings.filter((f) => f.severity === 'error')
  const warns = findings.filter((f) => f.severity === 'warn')
  const infos = findings.filter((f) => f.severity === 'info')

  // Orphans are one finding each so a consumer can act on one at a time, but a
  // project with no knowledge base yet reports every function it has — printing
  // those in full buries the findings somebody can actually fix.
  const isOrphan = (f: { id: string }) => f.id.startsWith('knowledge-orphan-')
  const orphans = warns.filter(isOrphan)
  const rest = infos
  const otherWarns = warns.filter((f) => !isOrphan(f))

  for (const finding of [...errors, ...otherWarns, ...rest]) {
    const icon =
      finding.severity === 'error'
        ? removed('✗')
        : finding.severity === 'warn'
          ? changed('⚠')
          : dim('ℹ')
    console.log(`${icon}  ${finding.message}`)
    console.log(`   ${dim('fix:')}  ${finding.fixHint}`)
    console.log()
  }

  if (orphans.length) {
    const shown = orphans.slice(0, ORPHANS_SHOWN)
    console.log(
      `${changed('⚠')}  ${orphans.length} thing${orphans.length !== 1 ? 's' : ''} in the code that no note describes`
    )
    for (const orphan of shown) {
      console.log(`   ${dim(orphan.id.slice('knowledge-orphan-'.length))}`)
    }
    if (orphans.length > shown.length) {
      console.log(`   ${dim(`… and ${orphans.length - shown.length} more`)}`)
    }
    console.log(`   ${dim('fix:')}  ${shown[0]!.fixHint}`)
    console.log()
  }

  const counts = [dim(`${notes} note${notes !== 1 ? 's' : ''}`)]
  if (errors.length) {
    counts.push(
      removed(`${errors.length} error${errors.length !== 1 ? 's' : ''}`)
    )
  }
  if (warns.length) {
    counts.push(
      changed(`${warns.length} warning${warns.length !== 1 ? 's' : ''}`)
    )
  }

  console.log('─'.repeat(40))
  console.log(counts.join('  '))
  if (ok && warns.length === 0 && errors.length === 0) {
    console.log(added('✓') + '  ' + dim('the knowledge base is consistent'))
  }
  // An error means the base contradicts itself, which a pipeline has to be able
  // to stop on — so this command reports it the only way a shell can read.
  if (!ok) process.exitCode = 1
}

export const renderKnowledgeIndex = (
  _services: unknown,
  { ok, check, files }: KnowledgeIndexResult
): void => {
  if (files.length === 0) {
    console.log(dim('No knowledge notes — nothing to index.'))
    return
  }

  for (const file of files) {
    if (file.action === 'unchanged') {
      console.log(`${dim('=')}  ${dim(file.path)}`)
    } else if (check) {
      console.log(`${removed('✗')}  ${file.path} ${dim(`(${file.action})`)}`)
    } else {
      console.log(`${added('✓')}  ${file.path} ${dim(`(${file.action})`)}`)
    }
  }

  console.log('─'.repeat(40))
  if (!check) {
    const written = files.filter((f) => f.action !== 'unchanged').length
    console.log(
      written === 0
        ? added('✓') + '  ' + dim('every index was already current')
        : added('✓') +
            `  ${written} index file${written !== 1 ? 's' : ''} written`
    )
  } else {
    console.log(
      ok
        ? added('✓') + '  ' + dim('every index is current')
        : removed('✗') +
            '  ' +
            'indexes are stale — run `pikku knowledge index`'
    )
    if (!ok) process.exitCode = 1
  }
}

type ConsoleUrl = { consoleUrl?: string }

const printConsoleUrl = (url: string | undefined) => {
  if (url) console.log(`${dim('see it in the console:')} ${url}`)
}

export const renderKnowledgePlanSchema = (
  _services: unknown,
  { schema }: KnowledgePlanSchemaResult
): void => {
  console.log(schema)
}

export const renderKnowledgePlanShow = (
  _services: unknown,
  { ok, path, body, consoleUrl }: KnowledgePlanShowResult & ConsoleUrl
): void => {
  if (!ok) {
    console.log(`${removed('✗')}  ${body}`)
    process.exitCode = 1
    return
  }
  console.log(dim(path))
  console.log(body)
  printConsoleUrl(consoleUrl)
}

const list = (
  label: string,
  entries: string[],
  colour: (s: string) => string
) => {
  if (entries.length === 0) return
  console.log(colour(`${label} (${entries.length})`))
  for (const entry of entries) console.log(`   ${entry}`)
  console.log()
}

export const renderKnowledgePlanProgress = (
  _services: unknown,
  {
    ok,
    path,
    message,
    done,
    missing,
    deferred,
    problems,
    consoleUrl,
  }: KnowledgePlanProgressResult & ConsoleUrl
): void => {
  if (message) {
    console.log(`${removed('✗')}  ${message}`)
    process.exitCode = 1
    return
  }
  console.log(dim(path))
  printConsoleUrl(consoleUrl)
  console.log()
  list('DONE', done, added)
  list('MISSING', missing, removed)
  list('DEFERRED to a later pass', deferred, dim)
  list('PROBLEMS', problems, changed)

  console.log('─'.repeat(40))
  if (ok) {
    console.log(`${added('✓')}  the plan's first pass is built`)
    return
  }
  if (missing.length > 0) {
    console.log(
      `${removed('✗')}  the changeset is not built yet — build each missing item, or move it out with ` +
        dim('pikku knowledge plan defer <changeset> <item> -r "<why>"')
    )
  }
  // A problem is something that EXISTS and does not do what was planned, so there is
  // nothing to defer — saying "defer it" here sends the reader to a command that will
  // refuse them.
  if (problems.length > 0) {
    console.log(
      `${removed('✗')}  the changeset is not built yet — fix what the problems above name. ` +
        dim(
          'A problem is never deferred; the thing exists, it just does something else.'
        )
    )
  }
  // The merge gate reads this exit code, so it has to be readable by a shell
  // and not only by whoever is reading the output.
  process.exitCode = 1
}

export const renderKnowledgePlanSet = (
  _services: unknown,
  {
    ok,
    path,
    problems,
    schema,
    consoleUrl,
  }: KnowledgePlanSetResult & ConsoleUrl
): void => {
  if (ok) {
    console.log(`${added('✓')}  plan written to ${path}`)
    console.log(dim('the build is measured against it'))
    printConsoleUrl(consoleUrl)
    return
  }
  console.log(`${removed('✗')}  not written:`)
  for (const problem of problems) {
    console.log(`   ${problem}`)
  }
  if (schema) {
    console.log()
    console.log(dim('the schema, in full — build the plan to match it:'))
    console.log(schema)
  }
  process.exitCode = 1
}

export const renderKnowledgePlanDefer = (
  _services: unknown,
  { ok, message }: KnowledgePlanDeferResult
): void => {
  console.log(`${ok ? added('✓') : removed('✗')}  ${message}`)
  if (!ok) process.exitCode = 1
}

export const renderKnowledgeGaps = (
  _services: unknown,
  { gaps }: KnowledgeGapsResult
): void => {
  if (gaps.length === 0) {
    console.log(`${added('✓')}  every note is built or filed`)
    return
  }
  for (const gap of gaps) {
    console.log(`${changed(gap.state.toUpperCase())}  ${gap.note}`)
    for (const left of gap.leftBehind)
      console.log(`   ${dim(`${left.item} — ${left.why}`)}`)
    for (const item of gap.missing)
      console.log(`   ${dim(`gone since ${gap.by.join(', ')}: ${item}`)}`)
  }
}
