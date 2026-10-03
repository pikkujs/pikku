import { runVerify, type VerifyResult } from '@pikku/code-edit/verify'
import { pikkuSessionlessFunc } from '#pikku/function'
import type { CLILogger } from '../../services/cli-logger.service.js'
import { added, changed, dim, removed } from '../../fabric/lib/output.js'

export const pikkuVerify = pikkuSessionlessFunc<
  { skipCodegen?: boolean; skipTypecheck?: boolean; skipFrontends?: boolean },
  VerifyResult
>({
  func: async ({ config }, input) => {
    const result = await runVerify({
      rootDir: config.rootDir,
      codegen: !input?.skipCodegen,
      typecheck: !input?.skipTypecheck,
      frontends: !input?.skipFrontends,
      pikkuCli: process.argv[1],
    })
    if (!result.ok) process.exitCode = 1
    return result
  },
})

const ICON = {
  error: removed('✗'),
  warn: changed('⚠'),
  info: dim('ℹ'),
} as const

export const renderPikkuVerify = (
  services: { logger: CLILogger },
  result: VerifyResult
): void => {
  if (services.logger.getOutputMode() === 'json') {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }
  const out: string[] = []
  for (const step of result.steps) {
    const name = step.target ? `${step.id} ${dim(step.target)}` : step.id
    const status = step.skipped
      ? dim(`skipped: ${step.skipped}`)
      : step.ok
        ? added('ok')
        : removed('failed')
    out.push(`${name}  ${status}  ${dim(`${step.durationMs}ms`)}`)
  }
  out.push('')
  for (const f of result.findings) {
    const at = f.file ? `${f.file}${f.line ? `:${f.line}` : ''}  ` : ''
    out.push(
      `${ICON[f.severity]}  ${at}${dim(`[${f.id}${f.code && f.code !== f.id ? ` ${f.code}` : ''}]`)} ${f.message}`
    )
    if (f.hint) out.push(`   ${dim('fix:')} ${f.hint}`)
  }
  const errors = result.findings.filter((f) => f.severity === 'error').length
  const warns = result.findings.filter((f) => f.severity === 'warn').length
  out.push(
    result.ok
      ? added(
          `✓  Verify passed${warns ? ` with ${warns} warning${warns === 1 ? '' : 's'}` : ''}`
        )
      : removed(
          `✗  Verify failed: ${errors} error${errors === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}`
        )
  )
  process.stdout.write(`${out.join('\n')}\n`)
}
