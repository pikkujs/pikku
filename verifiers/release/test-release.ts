/**
 * Offline verifier for `pikku release`.
 *
 * Runs the built CLI against a real pikku app in a git repo with a bare
 * remote, so the bump comes from real codegen output: a commit with no API
 * change is a patch, a new route is a minor, a removed route is a major.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const VERIFIER_DIR = process.cwd()
const REPO_ROOT = join(VERIFIER_DIR, '..', '..')
const PIKKU_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const WORK = join(VERIFIER_DIR, 'work')
const APP = join(WORK, 'app')
const REMOTE = join(WORK, 'remote.git')

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: APP, encoding: 'utf-8' }).trim()

function pikku(args: string[]): string {
  return execFileSync('node', [PIKKU_BIN, ...args], {
    cwd: APP,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 180_000,
  })
}

function pikkuFails(args: string[]): string {
  try {
    pikku(args)
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string }
    return `${err.stdout ?? ''}${err.stderr ?? ''}`
  }
  throw new Error(`pikku ${args.join(' ')} should have failed`)
}

function write(path: string, content: string) {
  const full = join(APP, path)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

const route = (
  name: string
) => `import { pikkuSessionlessFunc } from '#pikku/function'
import { wireHTTP } from '#pikku/http'

export const ${name} = pikkuSessionlessFunc<{ name: string }, { message: string }>({
  auth: false,
  func: async (_services, { name }) => ({ message: \`${name} \${name}\` }),
})

wireHTTP({ auth: false, route: '/api/${name}', method: 'get', func: ${name} })
`

function scaffold() {
  rmSync(WORK, { recursive: true, force: true })
  mkdirSync(APP, { recursive: true })
  execFileSync('git', ['init', '-q', '--bare', REMOTE])
  write(
    'package.json',
    JSON.stringify(
      {
        name: 'release-fixture',
        version: '0.1.0',
        type: 'module',
        private: true,
        imports: {
          '#pikku/*.js': './.pikku/*.ts',
          '#pikku/*': './.pikku/*/index.ts',
        },
      },
      null,
      2
    ) + '\n'
  )
  write(
    'pikku.config.json',
    JSON.stringify(
      {
        srcDirectories: ['./src', './types'],
        outDir: './.pikku',
        tsconfig: './tsconfig.json',
      },
      null,
      2
    ) + '\n'
  )
  write(
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          module: 'node18',
          target: 'esnext',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['node'],
        },
        include: ['src/', '.pikku/*', 'types/'],
      },
      null,
      2
    ) + '\n'
  )
  write(
    'types/application-types.d.ts',
    `import type { CoreConfig, CoreServices, CoreSingletonServices, CoreUserSession } from '@pikku/core/types'

export interface Config extends CoreConfig {}
export interface SingletonServices extends CoreSingletonServices<Config> {}
export interface Services extends CoreServices<SingletonServices> {}
export interface UserSession extends CoreUserSession {}
`
  )
  write('src/greet.ts', route('greet'))
  write('.gitignore', '.pikku\nnode_modules\n')
  git('init', '-q', '-b', 'staging')
  git('config', 'user.email', 'dev@example.com')
  git('config', 'user.name', 'dev')
  git('remote', 'add', 'origin', REMOTE)
}

function commitOnStaging(message: string, change: () => void) {
  git('fetch', '-q', 'origin')
  git('checkout', '-q', '--detach', 'origin/staging')
  change()
  git('add', '-A')
  git('commit', '-q', '-m', message)
  git('push', '-q', 'origin', 'HEAD:refs/heads/staging')
  pikku([])
}

function ship(): { version: string; level: string } {
  const prepared = pikku(['release', 'prepare'])
  pikku(['release', 'publish'])
  const result = JSON.parse(
    readFileSync(join(APP, '.pikku', 'release.gen.json'), 'utf-8')
  )
  if (!prepared.includes(`v${result.version}`)) {
    throw new Error(
      `prepare output does not name v${result.version}:\n${prepared}`
    )
  }
  return { version: result.version, level: result.level }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

let failures = 0
const results: Array<{
  name: string
  status: 'passed' | 'failed'
  error?: string
}> = []

function check(name: string, fn: () => void) {
  try {
    fn()
    results.push({ name, status: 'passed' })
  } catch (e) {
    failures++
    results.push({ name, status: 'failed', error: (e as Error).message })
  }
}

scaffold()

check('init writes a baseline from the generated surface', () => {
  pikku([])
  pikku(['release', 'init'])
  const snapshot = readFileSync(join(APP, 'surface.pikku.json'), 'utf-8')
  assert(
    snapshot.includes('greet'),
    `snapshot has no greet function:\n${snapshot}`
  )
  git('add', '-A')
  git('commit', '-q', '-m', 'init')
  git('push', '-q', 'origin', 'HEAD:refs/heads/staging')
})

check('a commit with no API change ships a patch', () => {
  commitOnStaging('docs', () => write('README.md', '# app\n'))
  const { version, level } = ship()
  assert(level === 'patch', `expected patch, got ${level}`)
  assert(version === '0.1.1', `expected 0.1.1, got ${version}`)
  git('fetch', '-q', '--tags', 'origin')
  assert(
    git('rev-parse', 'origin/main') === git('rev-parse', 'v0.1.1^{commit}'),
    'main is not at the v0.1.1 tag'
  )
})

check('a new route ships a minor', () => {
  commitOnStaging('add wave', () => write('src/wave.ts', route('wave')))
  const { version, level } = ship()
  assert(level === 'minor', `expected minor, got ${level}`)
  assert(version === '0.2.0', `expected 0.2.0, got ${version}`)
})

check('release diff --fail-on major fails on a removed route', () => {
  commitOnStaging('drop wave', () => rmSync(join(APP, 'src', 'wave.ts')))
  const out = pikkuFails(['release', 'diff', '--fail-on', 'major'])
  assert(
    out.includes('Release is major'),
    `diff did not fail as major:\n${out}`
  )
})

check('a removed route is breaking but only a minor below 1.0', () => {
  const { version, level } = ship()
  assert(level === 'major', `expected a major verdict, got ${level}`)
  assert(version === '0.3.0', `expected 0.3.0, got ${version}`)
  const changelog = readFileSync(join(APP, 'CHANGELOG.md'), 'utf-8')
  assert(
    changelog.indexOf('## 0.3.0') < changelog.indexOf('## 0.2.0'),
    'changelog is not newest first'
  )
  assert(
    /### Breaking[\s\S]*wave/.test(changelog),
    `no breaking entry for wave:\n${changelog}`
  )
})

check('--go-live releases 1.0.0', () => {
  git('fetch', '-q', 'origin')
  git('checkout', '-q', '--detach', 'origin/staging')
  pikku([])
  pikku(['release', 'prepare', '--go-live'])
  pikku(['release', 'publish'])
  git('fetch', '-q', '--tags', 'origin')
  assert(
    git('rev-parse', 'origin/main') === git('rev-parse', 'v1.0.0^{commit}'),
    'main is not at the v1.0.0 tag'
  )
})

check('publish leaves no release branch behind', () => {
  git('fetch', '-q', '--prune', 'origin')
  assert(
    git('branch', '-r', '--list', 'origin/release/next') === '',
    'release/next still exists'
  )
  assert(
    git('rev-parse', 'origin/main') === git('rev-parse', 'origin/staging'),
    'main and staging differ'
  )
})

rmSync(WORK, { recursive: true, force: true })

console.log('='.repeat(60))
console.log('Release Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.status === 'passed' ? '✓' : '✗'} ${r.name}`)
  if (r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
