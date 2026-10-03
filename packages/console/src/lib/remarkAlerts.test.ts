import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { alertKindOf, remarkAlerts } from './remarkAlerts.js'

type Node = {
  type: string
  value?: string
  children?: Node[]
  data?: { hProperties?: Record<string, unknown> }
}

/** The mdast remark produces for `> [!KIND]\n> body`, which is what the plugin sees. */
const quote = (marker: string, body = 'The body.'): Node => ({
  type: 'blockquote',
  children: [
    {
      type: 'paragraph',
      children: [
        { type: 'text', value: marker },
        { type: 'break' },
        { type: 'text', value: body },
      ],
    },
  ],
})

const transform = (tree: Node): Node => {
  remarkAlerts()(tree)
  return tree
}

const classOf = (node: Node) => node.data?.hProperties?.className as string

describe('remarkAlerts', () => {
  test('tags a marked quote with its kind', () => {
    const tree = transform({ type: 'root', children: [quote('[!NOTE]')] })
    assert.equal(alertKindOf(classOf(tree.children![0]!)), 'note')
  })

  test('every kind GitHub defines is recognised', () => {
    for (const kind of ['note', 'tip', 'important', 'warning', 'caution']) {
      const tree = transform({
        type: 'root',
        children: [quote(`[!${kind.toUpperCase()}]`)],
      })
      assert.equal(alertKindOf(classOf(tree.children![0]!)), kind)
    }
  })

  test('the marker and the line break it ended are removed', () => {
    const tree = transform({ type: 'root', children: [quote('[!WARNING]')] })
    const paragraph = tree.children![0]!.children![0]!
    assert.deepEqual(
      paragraph.children!.map((child) => child.value ?? child.type),
      ['The body.'],
      'the callout opens on its first real word, not on a blank line'
    )
  })

  test('a marker with text on the same line keeps that text', () => {
    const tree = transform({
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', value: '[!TIP] Run it twice.' }],
            },
          ],
        },
      ],
    })
    assert.equal(alertKindOf(classOf(tree.children![0]!)), 'tip')
    assert.equal(
      tree.children![0]!.children![0]!.children![0]!.value,
      'Run it twice.'
    )
  })

  test('an ordinary quote is left exactly as it was', () => {
    const plain = quote('As they put it:')
    const tree = transform({ type: 'root', children: [plain] })
    assert.equal(tree.children![0]!.data, undefined)
    assert.equal(alertKindOf(classOf(tree.children![0]!)), null)
    assert.equal(
      plain.children![0]!.children!.length,
      3,
      'nothing is stripped off a quote that is not an alert'
    )
  })

  test('an unknown marker is not an alert', () => {
    const tree = transform({ type: 'root', children: [quote('[!ASIDE]')] })
    assert.equal(alertKindOf(classOf(tree.children![0]!)), null)
  })

  test('a nested quote is found too', () => {
    const tree = transform({
      type: 'root',
      children: [{ type: 'listItem', children: [quote('[!CAUTION]')] }],
    })
    const nested = tree.children![0]!.children![0]!
    assert.equal(alertKindOf(classOf(nested)), 'caution')
  })
})
