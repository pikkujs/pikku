import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { docBlocks } from './surface-docs.js'

describe('docBlocks', () => {
  test('reflows a paragraph wrapped at whatever column its author used', () => {
    assert.deepEqual(
      docBlocks('Creates a Pikku function that can be\neither kind.'),
      [
        {
          kind: 'prose',
          text: 'Creates a Pikku function that can be either kind.',
        },
      ]
    )
  })

  test('keeps a blank line as a paragraph break', () => {
    assert.deepEqual(docBlocks('First para.\n\nSecond para.'), [
      { kind: 'prose', text: 'First para.' },
      { kind: 'prose', text: 'Second para.' },
    ])
  })

  test('keeps a fenced example as written', () => {
    assert.deepEqual(
      docBlocks(
        'Groups scenarios.\n\n```ts\nconst feature = pikkuFeature({\n  name: "auth",\n})\n```\n\nAfterwards.'
      ),
      [
        { kind: 'prose', text: 'Groups scenarios.' },
        {
          kind: 'code',
          text: 'const feature = pikkuFeature({\n  name: "auth",\n})',
        },
        { kind: 'prose', text: 'Afterwards.' },
      ]
    )
  })
})
