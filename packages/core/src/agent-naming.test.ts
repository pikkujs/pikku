import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = join(packageRoot, 'api-report.md')

/**
 * `AI` described the model provider, never the agent runtime, so #596 renamed
 * every agent symbol to `Agent`. The names below are the ones that survived,
 * because each really does wrap a provider call.
 *
 * Listing them here is what makes the rule checkable: anything else exported as
 * `AI*` is a symbol that slipped back to the old naming, and this fails rather
 * than letting it reach a consumer.
 */
const PROVIDER_SYMBOLS = new Set([
  'AIEmbeddingService',
  'AIEmbedManyParams',
  'AIEmbedManyResult',
  'AIEmbedParams',
  'AIEmbedResult',
  'AIGenerateImageParams',
  'AIGenerateImagePrompt',
  'AIGenerateImageResult',
  'AIGenerateSpeechParams',
  'AIGenerateSpeechResult',
  'AIProviderAuthError',
  'AIProviderNotConfiguredError',
  'AIProviderOptions',
  'AIRerankParams',
  'AIRerankResult',
  'AITranscriptionParams',
  'AITranscriptionResult',
])

describe('the agent runtime is not exported under the AI name', () => {
  test('every AI* symbol in the public surface is a provider wrapper', () => {
    const report = readFileSync(reportPath, 'utf-8')
    const found = new Set(report.match(/\bAI[A-Z][A-Za-z]*/g) ?? [])

    const strays = [...found].filter((name) => !PROVIDER_SYMBOLS.has(name))

    assert.deepEqual(
      strays,
      [],
      'these are exported as `AI*` but are not provider wrappers — rename them ' +
        'to `Agent*`, or add them to PROVIDER_SYMBOLS if they genuinely wrap a ' +
        'model provider call'
    )
  })

  test('the agent entry points are the renamed ones', () => {
    const { exports } = JSON.parse(
      readFileSync(join(packageRoot, 'package.json'), 'utf-8')
    )

    assert.ok(exports['./agent'], 'expected the ./agent entry point')
    assert.ok(
      exports['./agent-scorer'],
      'expected the ./agent-scorer entry point'
    )
    assert.equal(exports['./ai-agent'], undefined)
    assert.equal(exports['./ai-scorer'], undefined)
  })
})
