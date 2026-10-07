import { pikkuSessionlessFunc } from '#pikku/function'
import { added, changed, dim, removed } from '../../fabric/lib/output.js'
import { PROBLEM_REASON, runMocksCheck } from '../mocks/run-check.js'
import type { StubCheck } from '../mocks/stub-scan.js'

export const mocksCheck = pikkuSessionlessFunc<
  { src?: string; strict?: boolean },
  StubCheck
>({
  description:
    'Block a release that would publish a stub hook without a declared featureFlag',
  func: async ({ config }, input) =>
    runMocksCheck({
      rootDir: config.rootDir,
      outDir: config.outDir,
      src: input?.src,
      strict: input?.strict,
    }),
})

const reason = PROBLEM_REASON

export const renderMocksCheck = (
  _services: unknown,
  check: StubCheck
): void => {
  for (const call of check.calls) {
    const where = `${call.file}:${call.line}`
    const what = `${call.hook}(${call.rpc ? `'${call.rpc}'` : '…'})`
    if (call.problem === 'backend-supports') {
      console.log(
        `${removed('✗')} ${where}  ${what}: ${dim('the backend already supports this; use ' + call.hook.replace(/Stub$/, ''))}`
      )
    } else if (call.problem) {
      console.log(
        `${removed('✗')} ${where}  ${what}  ${dim(reason[call.problem](call.flag))}`
      )
    } else {
      console.log(
        `${added('✓')} ${where}  ${what}  ${dim(`flag ${call.flag}`)}`
      )
    }
  }
  for (const call of check.missing) {
    console.log(
      `${removed('✗')} ${call.file}:${call.line}  ${call.hook}('${call.rpc}')  ${dim('no function: implement it or use usePikkuQueryStub')}`
    )
  }
  for (const rpc of check.dead) {
    console.log(
      `${check.strict ? removed('✗') : changed('⚠')} ${dim(`${rpc}: unused, delete .mocks/${rpc.replaceAll(':', '.')}`)}`
    )
  }
  for (const rpc of check.unused) {
    console.log(
      `${check.strict ? removed('✗') : changed('⚠')} ${dim(`${rpc}: its mock is not called by anything in the frontend`)}`
    )
  }
  for (const flag of check.orphanFlags) {
    console.log(
      `${changed('⚠')} ${dim(`flag "${flag}" is declared but no stub uses it; other code may still use it`)}`
    )
  }
  if (check.unresolved) {
    console.log(
      dim(
        `${check.unresolved} hook call${check.unresolved === 1 ? '' : 's'} with a name that is not a string literal, so no mock is reported unused`
      )
    )
  }
  const blocked =
    check.calls.filter((call) => call.problem).length + check.missing.length
  console.log()
  console.log(
    dim(
      `${check.calls.length} stub call${check.calls.length === 1 ? '' : 's'} · ${blocked} blocked`
    )
  )
  if (!check.ok) process.exitCode = 1
}
