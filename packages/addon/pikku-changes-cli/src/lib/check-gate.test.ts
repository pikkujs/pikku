import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { FAKE_CLI } from '../harness/test-support.js'
import {
  hasPikkuProject,
  refuseUntilChecked,
  uncommitted,
} from './check-gate.js'

/** A CLI that is never run: the tests stub the check. */
const cli = [process.execPath, 'pikku'] as const

const dirs: string[] = []
const repo = (config?: string) => {
  const top = mkdtempSync(join(tmpdir(), 'check-gate-'))
  dirs.push(top)
  if (config) {
    mkdirSync(join(top, config.split('/').slice(0, -1).join('/') || '.'), {
      recursive: true,
    })
    writeFileSync(join(top, config), '{}')
  }
  return top
}
const gitFor =
  (top: string, status = '') =>
  async (args: string[]) =>
    args[0] === 'rev-parse' ? `${top}\n` : status
afterEach(() => {
  delete process.env.PIKKU_CHANGES_CHECK_GATE
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('refuseUntilChecked', () => {
  test('passes where there is no pikku project to check', async () => {
    const top = repo()
    await refuseUntilChecked({
      git: gitFor(top),
      label: '#1',
      cli,
      check: async () => assert.fail('must not run'),
    })
  })

  test('refuses uncommitted changes before it checks', async () => {
    const top = repo('packages/functions/pikku.config.json')
    await assert.rejects(
      refuseUntilChecked({
        git: gitFor(top, ' M a.ts\n'),
        label: '#1',
        cli,
        check: async () => assert.fail('must not run'),
      }),
      /uncommitted/
    )
  })

  test('refuses a failing check with the errors in the message', async () => {
    const top = repo('packages/functions/pikku.config.json')
    await assert.rejects(
      refuseUntilChecked({
        git: gitFor(top),
        label: '#5',
        cli,
        check: async () => ({
          code: 1,
          output: 'a.tsx(3,19): error TS2307: Cannot find module dayjs',
        }),
      }),
      /#5 does not pass `pikku check` at HEAD[\s\S]*Cannot find module dayjs/
    )
  })

  test('passes a clean tree whose check passes', async () => {
    const top = repo('pikku.config.json')
    await refuseUntilChecked({
      git: gitFor(top),
      label: '#1',
      cli,
      check: async () => ({ code: 0, output: '' }),
    })
  })

  test('nothing in the environment turns it off', async () => {
    const top = repo('pikku.config.json')
    process.env.PIKKU_CHANGES_CHECK_GATE = 'off'
    await assert.rejects(
      refuseUntilChecked({
        git: gitFor(top),
        label: '#1',
        cli,
        check: async () => ({ code: 2, output: 'error TS1' }),
      }),
      /does not pass/
    )
  })

  test('runs the CLI it is given in the project root, and a failing run is refused with its output', async () => {
    const top = repo('pikku.config.json')
    await refuseUntilChecked({
      git: gitFor(top),
      label: '#1',
      cli: [process.execPath, FAKE_CLI, 'clean'],
    })
    await assert.rejects(
      refuseUntilChecked({
        git: gitFor(top),
        label: '#2',
        cli: [process.execPath, FAKE_CLI, 'decorated'],
      }),
      /#2 does not pass `pikku check` at HEAD[\s\S]*broken output/
    )
  })

  test('finds a config at the root or one level down', () => {
    assert.equal(hasPikkuProject(repo('pikku.config.json')), true)
    assert.equal(hasPikkuProject(repo('apps/web/pikku.config.json')), true)
    assert.equal(hasPikkuProject(repo()), false)
  })

  test('a real repo with a pikku.config.json: an untracked compare report under artifacts/compare is not uncommitted work, other untracked files are', async () => {
    const top = repo('packages/functions/pikku.config.json')
    const sh = (...args: string[]) =>
      spawnSync('git', args, { cwd: top, encoding: 'utf8' }).stdout
    sh('init', '-q', '-b', 'main')
    sh('add', '.')
    sh('-c', 'user.email=t@e', '-c', 'user.name=t', 'commit', '-qm', 'init')
    mkdirSync(join(top, 'artifacts', 'compare', 'app'), {
      recursive: true,
    })
    writeFileSync(join(top, 'artifacts', 'compare', 'app', 'report.json'), '{}')
    const git = async (args: string[]) => sh(...args)
    let checked = 0
    await refuseUntilChecked({
      git,
      label: '#1',
      cli,
      check: async () => (checked++, { code: 0, output: '' }),
    })
    assert.equal(checked, 1)
    writeFileSync(join(top, 'stray.ts'), 'x')
    await assert.rejects(
      refuseUntilChecked({
        git,
        label: '#1',
        cli,
        check: async () => assert.fail('must not run'),
      }),
      /uncommitted/
    )
  })

  test('uncommitted leaves out scratch paths at any depth', () => {
    assert.deepEqual(
      uncommitted(
        '?? artifacts/compare/app/report.json\n?? apps/web/artifacts/compare/x.png\n M src/a.ts\n'
      ),
      [' M src/a.ts']
    )
  })
})
