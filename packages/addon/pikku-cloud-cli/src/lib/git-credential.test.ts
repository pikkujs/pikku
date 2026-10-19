import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { git } from '@pikku/cli/addon-support'
import {
  GIT_HELPER_COMMAND,
  answerCredentialRequest,
  cloudGitHost,
  parseCredentialRequest,
  registerGitHelper,
  unregisterGitHelper,
} from './git-credential.js'

describe('cloudGitHost', () => {
  test('swaps the api label for git', () => {
    assert.equal(
      cloudGitHost('https://api.pikkustudio.app', {}),
      'git.pikkustudio.app'
    )
  })
  test('an api without an api label has no git host', () => {
    assert.equal(cloudGitHost('http://localhost:4002', {}), null)
  })
  test('PIKKUSTUDIO_GIT_HOST wins', () => {
    assert.equal(
      cloudGitHost('http://localhost:4002', {
        PIKKUSTUDIO_GIT_HOST: 'Git.Example.com',
      }),
      'git.example.com'
    )
  })
})

describe('answerCredentialRequest', () => {
  const calls: unknown[] = []
  const invoke = async (input: unknown) => {
    calls.push(input)
    return { username: 'oauth2', password: 'tok' }
  }
  beforeEach(() => {
    calls.length = 0
  })

  test('answers get for the cloud git host with the repo path', async () => {
    const request = parseCredentialRequest(
      'protocol=https\nhost=git.pikkustudio.app\npath=projects/shop.git\n\n'
    )
    const out = await answerCredentialRequest({
      operation: 'get',
      request,
      gitHost: 'git.pikkustudio.app',
      invoke,
    })
    assert.equal(out, 'username=oauth2\npassword=tok\n')
    assert.deepEqual(calls, [
      {
        protocol: 'https',
        host: 'git.pikkustudio.app',
        path: 'projects/shop.git',
      },
    ])
  })

  test('other hosts, http, store and erase fall through', async () => {
    const cases = [
      { operation: 'get', text: 'protocol=https\nhost=github.com\npath=a/b\n' },
      {
        operation: 'get',
        text: 'protocol=http\nhost=git.pikkustudio.app\npath=a/b\n',
      },
      {
        operation: 'store',
        text: 'protocol=https\nhost=git.pikkustudio.app\n',
      },
      {
        operation: 'erase',
        text: 'protocol=https\nhost=git.pikkustudio.app\n',
      },
    ]
    for (const c of cases) {
      const out = await answerCredentialRequest({
        operation: c.operation,
        request: parseCredentialRequest(c.text),
        gitHost: 'git.pikkustudio.app',
        invoke,
      })
      assert.equal(out, '')
    }
    assert.equal(calls.length, 0)
  })
})

describe('registerGitHelper', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-git-helper-'))
  const file = join(dir, 'gitconfig')
  const previous = process.env.GIT_CONFIG_GLOBAL
  process.env.GIT_CONFIG_GLOBAL = file
  after(() => {
    if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL
    else process.env.GIT_CONFIG_GLOBAL = previous
    rmSync(dir, { recursive: true, force: true })
  })
  beforeEach(() => {
    writeFileSync(
      file,
      '[credential]\n\thelper = osxkeychain\n[credential "https://github.com"]\n\thelper = gh\n'
    )
  })

  const all = (key: string) =>
    git(['config', '--global', '--get-all', key]).catch(() => '')

  test('adds one host-scoped line, once, and leaves other helpers alone', async () => {
    await registerGitHelper('git.pikkustudio.app')
    await registerGitHelper('git.pikkustudio.app')
    assert.equal(
      await all('credential.https://git.pikkustudio.app.helper'),
      GIT_HELPER_COMMAND
    )
    assert.equal(
      await all('credential.https://git.pikkustudio.app.useHttpPath'),
      'true'
    )
    assert.equal(await all('credential.helper'), 'osxkeychain')
    assert.equal(await all('credential.https://github.com.helper'), 'gh')
  })

  test('unregister removes only its own line', async () => {
    await git([
      'config',
      '--global',
      '--add',
      'credential.https://git.pikkustudio.app.helper',
      'store',
    ])
    await registerGitHelper('git.pikkustudio.app')
    await unregisterGitHelper('git.pikkustudio.app')
    assert.equal(
      await all('credential.https://git.pikkustudio.app.helper'),
      'store'
    )
    assert.equal(
      await all('credential.https://git.pikkustudio.app.useHttpPath'),
      ''
    )
    assert.equal(await all('credential.helper'), 'osxkeychain')
    assert.equal(await all('credential.https://github.com.helper'), 'gh')
  })
})
