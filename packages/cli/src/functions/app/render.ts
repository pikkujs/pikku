import type {
  AppListOutput,
  AppNativeCheckOutput,
  AppNativeWriteOutput,
} from './schemas.js'

export function renderAppList(_s: unknown, result: AppListOutput): void {
  if (result.apps.length === 0) {
    console.log(
      '\nNo apps — "frontends" in pikku.config.json is empty. Add one with `pikku app new <name>`.\n'
    )
    return
  }
  for (const app of result.apps) {
    const facts = [
      app.kind,
      app.serves && `for ${app.serves}`,
      app.servedAt && `served at ${app.servedAt}`,
    ].filter(Boolean)
    console.log(
      `\n${app.name}  ${app.cwd}${facts.length ? `  (${facts.join(', ')})` : ''}`
    )
    if (app.native) {
      console.log(
        `  native: ${app.native.identifier} — ${app.native.platforms.join(', ')}, ${app.native.mode}` +
          (app.native.plugins.length
            ? `, plugins ${app.native.plugins.join(', ')}`
            : '')
      )
    }
  }
  console.log('')
}

export function renderAppNativeWrite(
  _s: unknown,
  result: AppNativeWriteOutput
): void {
  if (result.refusal) {
    console.log(`\n❌ ${result.name}: ${result.refusal}\n`)
    process.exitCode = 1
    return
  }
  console.log(
    `\n${result.created ? 'Created' : 'Updated'} ${result.dir}` +
      (result.written.length ? '' : ' — already up to date')
  )
  for (const file of result.written) console.log(`  ${file}`)
  if (result.nextSteps.length) {
    console.log('')
    for (const line of result.nextSteps) console.log(line)
  }
  console.log('')
}

export function renderAppNativeCheck(
  _s: unknown,
  result: AppNativeCheckOutput
): void {
  if (result.refusal) {
    console.log(`\n❌ ${result.refusal}\n`)
    process.exitCode = 1
    return
  }
  if (result.apps.length === 0) {
    console.log(
      '\nNo frontend has a native app. Add one with `pikku app native init <name>`.\n'
    )
    return
  }
  let failed = false
  for (const app of result.apps) {
    if (app.problems.length === 0) {
      console.log(`✓ ${app.name}`)
      continue
    }
    console.log(`\n${app.name}`)
    for (const problem of app.problems) {
      failed ||= problem.level === 'error'
      console.log(
        `  ${problem.level === 'error' ? '✗' : '!'} ${problem.message}`
      )
      console.log(
        `    → ${problem.fix === 'upgrade' ? `pikku app native upgrade ${app.name}` : problem.fix}`
      )
    }
  }
  console.log('')
  if (failed) process.exitCode = 1
}
