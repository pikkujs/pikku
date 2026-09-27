import { describe, test } from 'node:test'
import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const promptModule = join(here, 'prompt.ts')

/**
 * The prompts only behave differently because of what stdin is, so they can
 * only be tested in a process whose stdin we control. Each case runs a tiny
 * script in a child, with stdin either closed or a pipe — never a tty, which is
 * exactly the situation that used to hang.
 */
const runWithStdin = (
  source: string,
  stdinPayload: string | null
): Promise<{ code: number | null; stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    // The suite runs under bun (`run-tests.sh`), and the child has to be bun
    // too: it is what resolves the `./errors.js` specifier to the `.ts` file
    // next to it the way the package's own imports are written.
    const child = spawn(process.execPath, ['-e', source], {
      stdio: ['pipe', 'pipe', 'pipe'],
      // A prompt that hangs is the bug under test; a stuck child must fail the
      // test rather than the whole suite.
      timeout: 15_000,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => (stdout += c.toString()))
    child.stderr.on('data', (c) => (stderr += c.toString()))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    if (stdinPayload === null) child.stdin.end()
    else child.stdin.end(stdinPayload)
  })

const secretScript = `
import { promptSecret } from ${JSON.stringify(promptModule)}
try {
  const value = await promptSecret('TOKEN value', {
    nonInteractiveHint: "Pass the value with \`--value\`, or pipe it.",
  })
  process.stdout.write('VALUE:' + value)
} catch (error) {
  process.stderr.write('MESSAGE:' + error.message)
  process.exitCode = 1
}
`

const confirmScript = `
import { promptConfirm } from ${JSON.stringify(promptModule)}
try {
  await promptConfirm('Delete it?')
  process.stdout.write('ANSWERED')
} catch (error) {
  process.stderr.write('MESSAGE:' + error.message)
  process.exitCode = 1
}
`

describe('promptSecret without a tty', () => {
  test('reads the value piped in, so setting a secret can be scripted', async () => {
    const { code, stdout } = await runWithStdin(secretScript, 's3cret\n')
    assert.strictEqual(code, 0)
    assert.match(stdout, /VALUE:s3cret$/)
  })

  test('takes only the first line, and trims it', async () => {
    const { code, stdout } = await runWithStdin(
      secretScript,
      '  s3cret  \nignored\n'
    )
    assert.strictEqual(code, 0)
    assert.match(stdout, /VALUE:s3cret$/)
  })

  test('refuses with the remediation when stdin is closed, instead of hanging', async () => {
    const { code, stderr } = await runWithStdin(secretScript, null)
    assert.strictEqual(code, 1)
    assert.match(stderr, /stdin is not a tty/)
    assert.match(stderr, /Pass the value with `--value`/)
  })

  test('no node internals warning and no JS frame reaches the user', async () => {
    const { stderr } = await runWithStdin(secretScript, null)
    assert.doesNotMatch(stderr, /unsettled top-level await/)
    assert.doesNotMatch(stderr, /\n\s+at /)
  })
})

describe('promptConfirm without a tty', () => {
  test('refuses rather than waiting for an answer nobody can give', async () => {
    const { code, stderr } = await runWithStdin(confirmScript, null)
    assert.strictEqual(code, 1)
    assert.match(stderr, /stdin is not a tty/)
    assert.doesNotMatch(stderr, /unsettled top-level await/)
  })
})
