import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const VERIFIER_DIR = process.cwd()
const REPO_ROOT = join(VERIFIER_DIR, '..', '..')
const PIKKU_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const BINARY_OUTPUT = join(VERIFIER_DIR, 'dist', 'fixture-binary')

const isWindows = process.platform === 'win32'

function exe(path: string): string {
  return isWindows ? `${path}.exe` : path
}

function hostTarget(): string {
  const platform = process.platform === 'win32' ? 'windows' : process.platform
  return `bun-${platform}-${process.arch}`
}

function targetSuffix(target: string): string {
  return target.replace(/^bun-/, '').replace(/[^a-z0-9_-]/g, '-')
}

function runCLI(args: string[]): string {
  return execFileSync('node', [PIKKU_BIN, ...args], {
    cwd: VERIFIER_DIR,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 180_000,
  })
}

let failures = 0
const results: Array<{
  name: string
  status: 'passed' | 'failed'
  error?: string
}> = []

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    results.push({ name, status: 'passed' })
  } catch (e) {
    failures++
    results.push({ name, status: 'failed', error: (e as Error).message })
  }
}

rmSync(join(VERIFIER_DIR, 'dist'), { recursive: true, force: true })

await check('pikku binary command is registered (binary --help works)', () => {
  const out = runCLI(['binary', '--help'])
  if (!out.includes('binary')) {
    throw new Error(`"binary" command help not found:\n${out}`)
  }
})

await check('pikku binary compiles fixture.ts to a host native binary', () => {
  runCLI(['binary'])
  if (!existsSync(exe(BINARY_OUTPUT))) {
    throw new Error(
      `Expected binary at ${exe(BINARY_OUTPUT)} but it does not exist`
    )
  }
})

await check(
  'compiled host binary is executable and prints expected output',
  () => {
    const out = execFileSync(exe(BINARY_OUTPUT), [], { encoding: 'utf-8' })
    if (!out.includes('hello from pikku binary')) {
      throw new Error(`Unexpected output: ${out}`)
    }
  }
)

await check(
  'pikku binary --compile-target produces a target-suffixed binary',
  () => {
    const target = hostTarget()
    runCLI(['binary', '--compile-target', target])
    const targetBin = exe(`${BINARY_OUTPUT}-${targetSuffix(target)}`)
    if (!existsSync(targetBin)) {
      throw new Error(
        `Expected target binary at ${targetBin} but it does not exist`
      )
    }
  }
)

console.log('='.repeat(60))
console.log(`Binary Verifier Results (${process.platform}-${process.arch})`)
console.log('='.repeat(60))
for (const r of results) {
  const icon = r.status === 'passed' ? '✓' : '✗'
  console.log(`  ${icon} ${r.name}`)
  if (r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
