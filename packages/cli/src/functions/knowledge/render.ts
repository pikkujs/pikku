import type {
  KnowledgeIndexResult,
  KnowledgePlanDeferResult,
  KnowledgePlanSchemaResult,
  KnowledgePlanSetResult,
  KnowledgePlanShowResult,
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
