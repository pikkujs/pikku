import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  betterAuthGeneratedSecrets,
  declaredGeneratedSecrets,
  ensureDevSecrets,
  fillMissing,
  frontendEnv,
  missingRequiredSecrets,
  parseEnv,
} from './dev-env.js'

const tmp = () => mkdtempSync(join(tmpdir(), 'dev-env-'))
const fixed = (name: string, value = 'GENERATED') => ({
  name,
  generate: () => value,
})

describe('parseEnv', () => {
  test('reads KEY=value lines, strips quotes, skips comments', () => {
    assert.deepEqual(
      parseEnv('# c\nA=1\n  B = "two"\nC=\'three\'\n\nnot a line\nD=a=b'),
      { A: '1', B: 'two', C: 'three', D: 'a=b' }
    )
  })
})

describe('fillMissing', () => {
  test('never overwrites an existing value, even an empty string', () => {
    const target: Record<string, string | undefined> = { A: 'shell', E: '' }
    fillMissing(target, { A: 'file', B: 'file', E: 'file' })
    assert.deepEqual(target, { A: 'shell', B: 'file', E: '' })
  })
})

describe('frontendEnv', () => {
  test('frontend .env overrides root .env, and the shell beats both', () => {
    const dir = tmp()
    mkdirSync(join(dir, 'app'))
    writeFileSync(join(dir, 'app', '.env'), 'X=frontend\nY=frontend\n')
    const env = frontendEnv(
      { Y: 'shell' },
      { X: 'root', Y: 'root', Z: 'root' },
      join(dir, 'app')
    )
    assert.equal(env.X, 'frontend')
    assert.equal(env.Y, 'shell')
    assert.equal(env.Z, 'root')
  })
  test('works with no frontend .env', () => {
    assert.equal(frontendEnv({}, { Z: 'root' }, tmp()).Z, 'root')
  })
})

describe('ensureDevSecrets', () => {
  test('creates .env with the header and appends the secret', () => {
    const path = join(tmp(), '.env')
    const written = ensureDevSecrets(path, [fixed('BETTER_AUTH_SECRET')], {})
    assert.deepEqual(written, ['BETTER_AUTH_SECRET'])
    assert.equal(
      readFileSync(path, 'utf8'),
      '# Local development only — this file is gitignored and never deployed.\n' +
        '# Deployed stages get their own secrets injected by the platform.\n' +
        'BETTER_AUTH_SECRET=GENERATED\n'
    )
  })
  test('adds the missing newline before appending and keeps existing lines', () => {
    const path = join(tmp(), '.env')
    writeFileSync(path, 'FOO=bar')
    ensureDevSecrets(path, [fixed('S')], {})
    assert.equal(readFileSync(path, 'utf8'), 'FOO=bar\nS=GENERATED\n')
  })
  test('never overwrites a secret already in the file, with spacing or empty', () => {
    const path = join(tmp(), '.env')
    writeFileSync(path, '  S = keep\nT=\n')
    assert.deepEqual(ensureDevSecrets(path, [fixed('S'), fixed('T')], {}), [])
    assert.equal(readFileSync(path, 'utf8'), '  S = keep\nT=\n')
  })
  test('leaves a secret alone when the process environment already supplies it', () => {
    const path = join(tmp(), '.env')
    writeFileSync(path, '')
    assert.deepEqual(ensureDevSecrets(path, [fixed('S')], { S: 'shell' }), [])
  })
  test('writes nothing, not even the file, when there is nothing to generate', () => {
    const path = join(tmp(), '.env')
    assert.deepEqual(ensureDevSecrets(path, [], {}), [])
    assert.throws(() => readFileSync(path))
  })
  test('only appends the ones that are missing', () => {
    const path = join(tmp(), '.env')
    writeFileSync(path, 'A=1\n')
    assert.deepEqual(ensureDevSecrets(path, [fixed('A'), fixed('B')], {}), [
      'B',
    ])
  })
})

describe('generated secrets', () => {
  test('Better Auth secrets are 32 random bytes in base64', () => {
    const [secret] = betterAuthGeneratedSecrets(['BETTER_AUTH_SECRET'])
    const a = secret!.generate()
    assert.equal(Buffer.from(a, 'base64').length, 32)
    assert.notEqual(a, secret!.generate())
  })
  test('a declared secret with generate is hex of its size, others are skipped', () => {
    const secrets = declaredGeneratedSecrets([
      { secretId: 'A', generate: { size: 16 } },
      { secretId: 'B' },
    ])
    assert.deepEqual(
      secrets.map((s) => s.name),
      ['A']
    )
    assert.match(secrets[0]!.generate(), /^[0-9a-f]{32}$/)
  })
})

describe('missingRequiredSecrets', () => {
  test('reports required, non-generatable, unset secrets once', () => {
    const missing = missingRequiredSecrets(
      [
        { secretId: 'API_KEY' },
        { secretId: 'API_KEY' },
        { secretId: 'OPT', optional: true },
        { secretId: 'GEN', generate: { size: 16 } },
        { secretId: 'BETTER_AUTH_SECRET' },
        { secretId: 'SET' },
      ],
      { SET: 'x' },
      [fixed('BETTER_AUTH_SECRET')]
    )
    assert.deepEqual(missing, ['API_KEY'])
  })
})
