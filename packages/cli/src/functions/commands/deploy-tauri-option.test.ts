import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `deploy-apply.ts` cannot be imported from a test: it pulls in
 * `#pikku/function`, which only exists after the CLI's own codegen has run. So
 * the wiring is checked at the source level instead. What it guards is the
 * realistic regression — a flag declared but never forwarded, or forwarded but
 * never declared, either of which makes `--tauri` silently do nothing. The
 * behaviour on the other side of the handoff is covered by the standalone
 * adapter's own tests, which construct it with exactly these options.
 */
const cliSrc = fileURLToPath(new URL('../..', import.meta.url))

const read = (...segments: string[]) =>
  readFileSync(join(cliSrc, ...segments), 'utf-8')

describe('`pikku deploy apply --tauri`', () => {
  it('is declared as an option on the deploy apply command', () => {
    const wiring = read('cli.wiring.ts')
    const applyBlock = wiring.slice(
      wiring.indexOf('func: deployApply'),
      wiring.indexOf('func: deployInfo')
    )
    assert.match(
      applyBlock,
      /tauri: \{/,
      'an undeclared flag is dropped before the command ever sees it'
    )
  })

  it('is accepted by the command that has to act on it', () => {
    const apply = read('functions', 'commands', 'deploy-apply.ts')
    assert.match(
      apply,
      /tauri\?: boolean/,
      'deployApply must take the flag in its input type'
    )
  })

  it('reaches the provider adapter together with the project root', () => {
    const apply = read('functions', 'commands', 'deploy-apply.ts')
    const call =
      /resolveProvider\(\s*config,\s*data\?\.provider,\s*\{([\s\S]*?)\}\s*\)/.exec(
        apply
      )
    assert.ok(call, 'the provider is resolved with an options object')
    const forwarded = call[1]!
    assert.match(forwarded, /tauri:/)
    assert.match(
      forwarded,
      /projectDir[,:]/,
      'without the project root there is nowhere to write src-tauri/'
    )
    assert.match(
      forwarded,
      /tauriIdentifier:/,
      'the bundle identifier has to come from the project, not a hardcoded default'
    )
  })

  it('widens the provider options type rather than casting the flag through', () => {
    const apply = read('functions', 'commands', 'deploy-apply.ts')
    const signature =
      /export async function resolveProvider\([\s\S]*?\n\)/.exec(apply)
    assert.ok(signature)
    assert.match(signature[0]!, /tauri\?: boolean/)
    assert.match(signature[0]!, /projectDir\?: string/)
  })

  it('takes the bundle identifier from deploy config', () => {
    const configTypes = readFileSync(
      join(cliSrc, '..', 'types', 'config.d.ts'),
      'utf-8'
    )
    const deployBlock = configTypes.slice(
      configTypes.indexOf('  deploy?: {'),
      configTypes.indexOf('namedFilters?')
    )
    assert.match(deployBlock, /tauri\?: \{/)
    assert.match(deployBlock, /identifier\?: string/)
  })
})
