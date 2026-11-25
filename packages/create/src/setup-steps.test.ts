import { strict as assert } from 'assert'
import { describe, test } from 'node:test'

import {
  assertBunAvailable,
  installDependencies,
  runStep,
  SetupError,
  starterNextSteps,
  starterPackageManager,
  type RunCommand,
} from './setup-steps.js'

const recorder = (failing?: string) => {
  const commands: string[] = []
  const run: RunCommand = (command, args) => {
    const line = [command, ...args].join(' ')
    commands.push(line)
    return { status: line === failing ? 1 : 0 }
  }
  return { commands, run }
}

const starter = {
  template: 'starter-template',
  packageManager: 'bun',
  install: true,
}

describe('installDependencies', () => {
  test('installs and generates the starter with Bun only', async () => {
    const { commands, run } = recorder()

    await installDependencies('/project', starter, run)

    assert.deepEqual(commands, [
      'bun install',
      'bun x --bun --no-install pikku --silent',
    ])
  })

  for (const [packageManager, install] of [
    ['npm', 'npm install'],
    ['yarn', 'yarn install --no-immutable'],
    ['bun', 'bun install'],
  ] as const) {
    test(`runs another template with ${packageManager}`, async () => {
      const { commands, run } = recorder()

      await installDependencies(
        '/project',
        { template: 'express', packageManager, install: true },
        run
      )

      assert.deepEqual(commands, [install, `${packageManager} pikku --silent`])
    })
  }

  test('stops at a failed install and says what failed', async () => {
    const { commands, run } = recorder('bun install')

    await assert.rejects(
      installDependencies('/project', starter, run),
      (error: Error) =>
        error instanceof SetupError &&
        /`bun install` failed with exit code 1 in \/project/.test(
          error.message
        ) &&
        /setup is not complete/.test(error.message)
    )
    assert.deepEqual(commands, ['bun install'])
  })

  for (const [template, packageManager, failing] of [
    ['starter-template', 'bun', 'bun x --bun --no-install pikku --silent'],
    ['express', 'npm', 'npm pikku --silent'],
  ] as const) {
    test(`fails when codegen fails for ${template}`, async () => {
      const { run } = recorder(failing)

      await assert.rejects(
        installDependencies(
          '/project',
          { template, packageManager, install: true },
          run
        ),
        SetupError
      )
    })
  }

  test('fails when the second codegen pass of the cli template fails', async () => {
    let passes = 0

    await assert.rejects(
      installDependencies(
        '/project',
        { template: 'cli', packageManager: 'npm', install: true },
        (_command, args) => ({
          status: args[0] === 'pikku' && ++passes === 2 ? 1 : 0,
        })
      ),
      SetupError
    )
    assert.equal(passes, 2)
  })

  test('runs nothing without an install', async () => {
    const { commands, run } = recorder()

    await installDependencies('/project', { ...starter, install: false }, run)

    assert.deepEqual(commands, [])
  })
})

describe('runStep', () => {
  const step = () =>
    runStep('create-pikku-no-such-command', [], process.cwd(), 'Stopped.')

  test('fails for a command that cannot be started', () => {
    assert.throws(
      step,
      /could not be run: .*create-pikku-no-such-command.*Stopped\./
    )
  })

  test('fails for a command that exits non-zero', () => {
    assert.throws(
      () =>
        runStep(
          process.execPath,
          ['-e', 'process.exit(3)'],
          process.cwd(),
          'Stopped.'
        ),
      /failed with exit code 3/
    )
  })

  test('fails for a command that is killed', () => {
    assert.throws(
      () =>
        runStep('bun', ['install'], '/project', 'Stopped.', () => ({
          status: null,
          signal: 'SIGKILL',
        })),
      /was stopped by SIGKILL/
    )
  })
})

describe('the starter template', () => {
  test('uses Bun when no package manager is named, or Bun is', () => {
    assert.equal(starterPackageManager({}), 'bun')
    assert.equal(starterPackageManager({ packageManager: 'bun' }), 'bun')
  })

  for (const packageManager of ['npm', 'yarn', 'pnpm']) {
    test(`refuses --package-manager ${packageManager}`, () => {
      assert.throws(
        () => starterPackageManager({ packageManager }),
        new RegExp(`--package-manager ${packageManager} is not supported`)
      )
    })
  }

  test('refuses --yarn-link', () => {
    assert.throws(
      () => starterPackageManager({ yarnLink: '../pikku' }),
      /--yarn-link is not supported/
    )
  })

  test('fails clearly when bun is missing or broken', () => {
    for (const result of [
      { status: null, error: new Error('spawn bun ENOENT') },
      { status: 127 },
    ]) {
      assert.throws(() => assertBunAvailable(() => result), /uses Bun/)
    }
    assert.doesNotThrow(() => assertBunAvailable(() => ({ status: 0 })))
  })

  const firstRun = [
    'bunx --bun pikku db generate',
    'bunx --bun pikku db migrate',
    'bun run dev',
  ]

  test('prints Bun next steps that create the database before dev', () => {
    assert.deepEqual(starterNextSteps('my-app', true), [
      'cd my-app',
      ...firstRun,
    ])
  })

  test('adds the install and codegen when they were skipped', () => {
    assert.deepEqual(starterNextSteps('my-app', false), [
      'cd my-app',
      'bun install',
      'bunx --bun pikku all',
      ...firstRun,
    ])
  })
})
