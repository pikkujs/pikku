import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface FrontendTypeCheckResult {
  /** fabric.config.json frontend key, e.g. "app" */
  name: string
  /** absolute directory that was type-checked */
  dir: string
  /** raw `file(line,col): error TSxxxx: message` lines, in tsc's order */
  errors: string[]
  /** set when the frontend could not be checked at all (no tsconfig, tsc missing) */
  skipped?: string
}

/**
 * Run each deployable frontend's type-check exactly as the Fabric build
 * container does, so a type error fails `fabric validate` on the developer's
 * machine instead of eight minutes into a deploy.
 *
 * The container runs the frontend's own `tsc` script (falling back to
 * `tsc --noEmit`) and aborts the deploy on a non-zero exit; the deploy budget
 * is 10/day, so spending one on a TS2353 is expensive. Everything else in
 * validate is a structural heuristic *approximating* this compile — this is the
 * compile.
 */
export async function typeCheckFrontends(
  root: string,
  frontendDirs: Array<{ name: string; dir: string }>
): Promise<FrontendTypeCheckResult[]> {
  const results: FrontendTypeCheckResult[] = []
  for (const { name, dir } of frontendDirs) {
    if (!existsSync(join(dir, 'tsconfig.json'))) {
      results.push({ name, dir, errors: [], skipped: 'no tsconfig.json' })
      continue
    }
    const pkg = await readPackageJson(dir)
    const runner = await resolveRunner(root, dir)
    const { command, args } = pkg?.scripts?.tsc
      ? { command: runner, args: ['run', 'tsc'] }
      : { command: runner === 'npm' ? 'npx' : runner, args: ['tsc', '--noEmit'] }

    const { code, output, spawnError } = await run(command, args, dir)
    if (spawnError) {
      results.push({ name, dir, errors: [], skipped: spawnError })
      continue
    }
    results.push({
      name,
      dir,
      errors: code === 0 ? [] : parseTscErrors(output),
    })
  }
  return results
}

interface PackageJson {
  scripts?: Record<string, string>
  packageManager?: string
}

async function readPackageJson(dir: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(
      await readFile(join(dir, 'package.json'), 'utf-8')
    ) as PackageJson
  } catch {
    // A frontend without a readable package.json still gets checked via the
    // `tsc --noEmit` fallback — the missing manifest is reported by other checks.
    return null
  }
}

/**
 * The package manager the project declares, so `run tsc` resolves the same
 * workspace-local typescript the deploy would. Falls back to npm.
 */
async function resolveRunner(root: string, dir: string): Promise<string> {
  for (const candidate of [dir, root]) {
    const pkg = await readPackageJson(candidate)
    const declared = pkg?.packageManager
    if (declared) return declared.split('@')[0]!
  }
  if (existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb')))
    return 'bun'
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm'
  return 'npm'
}

function run(
  command: string,
  args: string[],
  cwd: string
): Promise<{ code: number; output: string; spawnError?: string }> {
  return new Promise((resolve) => {
    let output = ''
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    })
    child.stdout?.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      resolve({
        code: 1,
        output,
        spawnError:
          error.code === 'ENOENT'
            ? `${command} not found on PATH`
            : error.message,
      })
    })
    child.on('close', (code) => resolve({ code: code ?? 1, output }))
  })
}

/**
 * Keep only tsc's diagnostic lines. The runner wraps the command with its own
 * chatter ("$ tsc --noEmit", "error Command failed with exit code 2"), which is
 * noise in a finding.
 */
function parseTscErrors(output: string): string[] {
  const diagnostic = /^\S.*?\(\d+,\d+\): (?:error|warning) TS\d+: /
  const errors = output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => diagnostic.test(line))
  if (errors.length > 0) return errors
  // A non-zero exit with no parseable diagnostic still failed the build — keep
  // the tail rather than reporting a clean pass.
  return output.trim().split('\n').slice(-5).filter(Boolean)
}
