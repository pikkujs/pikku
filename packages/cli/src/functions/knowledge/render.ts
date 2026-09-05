import type {
  KnowledgeIndexResult,
  KnowledgePlanDeferResult,
  KnowledgePlanProgressResult,
  KnowledgePlanSchemaResult,
  KnowledgePlanSetResult,
  KnowledgePlanShowResult,
  KnowledgeReconcileResult,
  KnowledgeValidateResult,
} from '@pikku/knowledge'
import { added, changed, dim, removed } from '../../fabric/lib/output.js'

export const renderKnowledgeValidate = (
  _services: unknown,
  { ok, notes, findings }: KnowledgeValidateResult
): void => {
  const errors = findings.filter((f) => f.severity === 'error')
  const warns = findings.filter((f) => f.severity === 'warn')
  const infos = findings.filter((f) => f.severity === 'info')

  for (const finding of [...errors, ...warns, ...infos]) {
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

export const renderKnowledgePlanSchema = (
  _services: unknown,
  { schema }: KnowledgePlanSchemaResult
): void => {
  console.log(schema)
}

export const renderKnowledgePlanShow = (
  _services: unknown,
  { ok, path, body }: KnowledgePlanShowResult
): void => {
  if (!ok) {
    console.log(`${removed('✗')}  ${body}`)
    process.exitCode = 1
    return
  }
  console.log(dim(path))
  console.log(body)
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
  }: KnowledgePlanProgressResult
): void => {
  if (message) {
    console.log(`${removed('✗')}  ${message}`)
    process.exitCode = 1
    return
  }
  console.log(dim(path))
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
      `${removed('✗')}  the milestone is not built yet — build each missing item, or move it out with ` +
        dim('pikku knowledge plan defer <milestone> <item> -r "<why>"')
    )
  }
  // A problem is something that EXISTS and does not do what was planned, so there is
  // nothing to defer — saying "defer it" here sends the reader to a command that will
  // refuse them.
  if (problems.length > 0) {
    console.log(
      `${removed('✗')}  the milestone is not built yet — fix what the problems above name. ` +
        dim(
          'A problem is never deferred; the thing exists, it just does something else.'
        )
    )
  }
  // A build closes a milestone on this exit code, so it has to be readable by a shell
  // and not only by whoever is reading the output.
  process.exitCode = 1
}

export const renderKnowledgePlanSet = (
  _services: unknown,
  { ok, path, problems, schema }: KnowledgePlanSetResult
): void => {
  if (ok) {
    console.log(`${added('✓')}  plan written to ${path}`)
    console.log(dim('the build is measured against it'))
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

/**
 * What to do next, and — when only a person can settle it — the question to put to
 * them.
 *
 * The action's `reason` is machine wording that names the note and the frontmatter
 * key; on `ask-user` it is deliberately NOT what gets printed as the question, because
 * the reader there has never seen a note. The options are numbered rather than
 * rendered as a picker: this is the fallback every harness has, and one that can do
 * better reads the same answer as JSON.
 */
export const renderKnowledgeReconcile = (
  _services: unknown,
  { kind, reason, note, hold, notes, question }: KnowledgeReconcileResult
): void => {
  if (kind === 'idle') {
    console.log(`${dim('=')}  ${dim(reason)}`)
    return
  }

  const label: Record<string, string> = {
    'repair-note': 'REPAIR',
    'write-plan': 'PLAN',
    'ask-user': 'ASK',
    dispatch: 'BUILD',
    hold: 'HELD',
  }
  const paint = kind === 'dispatch' ? added : kind === 'hold' ? dim : changed
  console.log(
    `${paint(label[kind] ?? kind.toUpperCase())}  ${note ?? ''}`.trim()
  )
  console.log()

  if (question) {
    console.log(`${dim(question.header)}`)
    console.log(question.question)
    question.options.forEach((option, index) => {
      const description = option.description
        ? `  ${dim(option.description)}`
        : ''
      console.log(`  ${index + 1}. ${option.label}${description}`)
    })
    if (question.options.length === 0) console.log(dim('  (free text)'))
    console.log()
    console.log(`${dim('why:')}  ${dim(reason)}`)
    return
  }

  console.log(reason)
  if (hold) {
    console.log()
    console.log(`${dim('held on:')}  ${hold}`)
    for (const path of notes ?? []) console.log(`  ${dim(path)}`)
  }
}
