import { added, changed, dim, removed } from '../../fabric/lib/output.js'
import type { ContractChange } from './contract.js'
import type { MocksDiff } from './diff.js'

const kinds = (list?: string[]): string => (list ?? []).join(' | ')

const describe = ({ path, kind, mock, fn }: ContractChange): string =>
  kind === 'mock-only'
    ? `${added('+')} ${path}  ${dim(`in the mock (${kinds(mock)}), not in the function`)}`
    : kind === 'function-only'
      ? `${removed('-')} ${path}  ${dim(`the function returns it (${kinds(fn)}), the mock does not`)}`
      : `${changed('~')} ${path}  ${dim(`mock ${kinds(mock)}, function ${kinds(fn)}`)}`

export const renderMocksDiff = (_services: unknown, diff: MocksDiff): void => {
  if (!diff.rpcs.length) {
    console.log(dim('No mocks found. Add .mocks/<rpc.name>/<mock>.json'))
  }
  for (const report of diff.rpcs) {
    const label =
      report.status === 'ok'
        ? added('ok')
        : report.status === 'added'
          ? added('added')
          : report.status === 'changed'
            ? changed('changed')
            : removed('invalid')
    const note =
      report.status === 'added' ? dim('  mocked, no function yet') : ''
    console.log(
      `${label}  ${report.rpc}  ${dim(`${report.mocks} mock${report.mocks === 1 ? '' : 's'}`)}${note}`
    )
    for (const change of report.changes) console.log(`     ${describe(change)}`)
    for (const { mock, errors } of report.invalid) {
      for (const error of errors)
        console.log(`     ${removed('✗')} ${mock}: ${error}`)
    }
    for (const problem of report.problems)
      console.log(`     ${removed('✗')} ${problem}`)
    for (const warning of report.warnings)
      console.log(`     ${changed('⚠')} ${dim(warning)}`)
  }
  if (diff.unmocked.length) {
    console.log()
    console.log(
      dim(
        `${diff.unmocked.length} function${diff.unmocked.length === 1 ? '' : 's'} without a mock`
      )
    )
    for (const key of diff.unmocked) console.log(`   ${dim(key)}`)
  }
  console.log()
  const count = (status: string) =>
    diff.rpcs.filter((r) => r.status === status).length
  console.log(
    dim(
      `${diff.rpcs.length} mocked · ${count('ok')} ok · ${count('added')} added · ${count('changed')} changed · ${count('invalid')} invalid`
    )
  )
  if (!diff.ok) process.exitCode = 1
}
