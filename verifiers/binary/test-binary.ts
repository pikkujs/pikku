import { execFileSync, execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const VERIFIER_DIR = process.cwd()
const REPO_ROOT = join(VERIFIER_DIR, '..', '..')
const PIKKU_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const BINARY_OUTPUT = join(VERIFIER_DIR, 'dist', 'fixture-binary')

let failures = 0
const results: Array<{ name: string; passed: boolean; error?: string }> = []

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    results.push({ name, passed: true })
  } catch (e) {
    failures++
    results.push({ name, passed: false, error: (e as Error).message })
  }
}

rmSync(join(VERIFIER_DIR, 'dist'), { recursive: true, force: true })

await check('pikku binary command is registered (binary --help works)', () => {
  const out = execSync(`node ${PIKKU_BIN} binary --help`, { encoding: 'utf-8' })
  if (!out.includes('compile') && !out.includes('binary')) {
    throw new Error(`"binary" command help not found:\n${out}`)
  }
})

await check('pikku binary compiles fixture.ts to native binary', () => {
  execSync(`node ${PIKKU_BIN} binary`, {
    cwd: VERIFIER_DIR,
    stdio: 'pipe',
    timeout: 120_000,
  })
  if (!existsSync(BINARY_OUTPUT)) {
    throw new Error(`Expected binary at ${BINARY_OUTPUT} but it does not exist`)
  }
})

await check('compiled binary is executable and prints expected output', () => {
  const out = execFileSync(BINARY_OUTPUT, [], { encoding: 'utf-8' })
  if (!out.includes('hello from pikku binary')) {
    throw new Error(`Unexpected output: ${out}`)
  }
})

await check(
  'pikku binary --compile-target produces a target-suffixed binary',
  () => {
    const platformTarget =
      process.platform === 'darwin' ? 'bun-darwin-arm64' : 'bun-linux-x64'
    execSync(`node ${PIKKU_BIN} binary --compile-target ${platformTarget}`, {
      cwd: VERIFIER_DIR,
      stdio: 'pipe',
      timeout: 120_000,
    })
    const suffix = process.platform === 'darwin' ? 'darwin-arm64' : 'linux-x64'
    const targetBin = `${BINARY_OUTPUT}-${suffix}`
    if (!existsSync(targetBin)) {
      throw new Error(
        `Expected target binary at ${targetBin} but it does not exist`
      )
    }
  }
)

console.log('='.repeat(60))
console.log('Binary Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
