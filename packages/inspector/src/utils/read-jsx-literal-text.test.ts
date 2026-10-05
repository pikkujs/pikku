import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readJsxLiteralText } from './read-jsx-literal-text.js'

const read = (jsx: string) =>
  readJsxLiteralText('a.tsx', `export const A = () => ${jsx}\n`).map(
    (f) => f.text
  )

describe('readJsxLiteralText', () => {
  test('finds text, expression strings and text attributes', () => {
    assert.deepEqual(read(`<p title="Hi there">Hello {'World'}</p>`).sort(), [
      'Hello',
      'Hi there',
      'World',
    ])
  })

  test('ignores class names, data attributes, symbols and dynamic values', () => {
    assert.deepEqual(
      read(`<p className="a b" data-x="y">{t} · {'—'} {n}</p>`),
      []
    )
  })

  test('finds a sentence in any attribute, but not a class name or one word', () => {
    assert.deepEqual(
      read(
        `<Card why="Anyone can book a class" variant="hero" className="flex gap-2" />`
      ),
      ['Anyone can book a class']
    )
  })

  test('finds prose in text-like object properties', () => {
    const found = readJsxLiteralText(
      'a.tsx',
      `const f = [{ title: 'Cheap hosting', tone: 'bg-accent', id: 'x' }]\n`
    )
    assert.deepEqual(
      found.map((x) => x.text),
      ['Cheap hosting']
    )
  })

  test('finds strings in conditional branches', () => {
    assert.deepEqual(
      read(
        `<p>{a ? 'Undo one' : 'Undo all'} {ok && 'Saved'} {name || 'Anonymous'} {n}</p>`
      ).sort(),
      ['Anonymous', 'Saved', 'Undo all', 'Undo one']
    )
  })

  test('finds a sentence anywhere, but not a class list, a token or a type', () => {
    const found = readJsxLiteralText(
      'a.tsx',
      `const steps = ['Add what your app needs', 'flex gap-2', 'bg-[#fff] p-2']\nconst tag = 'Ready'\nimport x from 'Some Package'\ntype T = 'Two words'\n`
    )
    assert.deepEqual(
      found.map((x) => x.text),
      ['Add what your app needs']
    )
  })

  test('reports the line', () => {
    const [found] = readJsxLiteralText(
      'a.tsx',
      `const a = 1\nexport const A = () => <p>Hi</p>\n`
    )
    assert.equal(found!.line, 2)
  })
})
