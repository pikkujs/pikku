import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dirname, '..')
const sources = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sources(join(d, e.name))
      : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')
        ? [join(d, e.name)]
        : []
  )

describe('cloud-cli takes its key crypto from services', () => {
  test('CloudSecretsSet seals through services.keyCrypto and never names a provider', () => {
    const text = readFileSync(
      join(dir, 'functions', 'secrets-set.function.ts'),
      'utf8'
    )
    assert.match(text, /func: async \(\{ keyCrypto \}/)
    assert.match(text, /keyCrypto\.seal\(/)
    assert.doesNotMatch(text, /@pikku\/jose|createJoseKeyCrypto/)
  })

  test('only services.ts names the jose provider', () => {
    const named = sources(dir).filter((f) =>
      /@pikku\/jose|createJoseKeyCrypto/.test(readFileSync(f, 'utf8'))
    )
    assert.deepEqual(
      named.map((f) => f.slice(dir.length + 1)),
      ['services.ts']
    )
  })
})
