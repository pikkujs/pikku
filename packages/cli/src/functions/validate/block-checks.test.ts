import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { blocksDir, runBlockChecks } from './block-checks.js'

const write = async (root: string, rel: string, content: string) => {
  const file = join(root, rel)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}

const project = async (config: object = { blocks: true }) => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-blocks-'))
  await write(root, 'pikku.config.json', JSON.stringify(config))
  return root
}

const clean = `export const Card = ({ title }: { title: string }) => <h1 title={title}>{title}</h1>\n`

describe('block checks', () => {
  test('applies only where pikku.config.json declares blocks', async () => {
    const plain = await project({})
    await write(
      plain,
      'src/blocks/Card.tsx',
      `export const Card = () => <h1>Your app</h1>\n`
    )
    assert.equal(blocksDir(plain), undefined)
    assert.deepEqual(await runBlockChecks(plain), [])
    assert.equal(blocksDir(await project()), 'src/blocks')
    assert.equal(blocksDir(await project({ blocks: 'lib/ui' })), 'lib/ui')
    assert.equal(blocksDir(await project({ blocks: false })), undefined)
  })

  test('a declared directory is the one that is checked', async () => {
    const root = await project({ blocks: 'lib/ui' })
    await write(
      root,
      'lib/ui/Card.tsx',
      `export const Card = () => <h1>Your app</h1>\n`
    )
    await write(
      root,
      'src/blocks/Other.tsx',
      `export const Other = () => <h1>Other text</h1>\n`
    )
    const findings = await runBlockChecks(root)
    assert.equal(
      findings.filter((f) => f.id === 'block-literal-string').length,
      1
    )
  })

  test('a literal string in text is an error', async () => {
    const root = await project()
    await write(
      root,
      'src/blocks/Card.tsx',
      `export const Card = () => <h1>Your app</h1>\n`
    )
    const findings = await runBlockChecks(root)
    const error = findings.find((f) => f.id === 'block-literal-string')
    assert.equal(error?.severity, 'error')
    assert.match(error!.message, /Your app/)
    assert.equal(
      findings.some((f) => f.id === 'block-productized'),
      false
    )
  })

  test('a literal string in a text attribute is an error', async () => {
    const root = await project()
    await write(
      root,
      'src/blocks/Card.tsx',
      `export const Card = () => <input placeholder="Search" />\n`
    )
    const findings = await runBlockChecks(root)
    assert.equal(
      findings.filter((f) => f.id === 'block-literal-string').length,
      1
    )
  })

  test('props, class names and symbols are not literal strings', async () => {
    const root = await project()
    await write(
      root,
      'src/blocks/Card.tsx',
      `export const Card = ({ t }: { t: string }) => <div className="flex gap-2" data-id="a">{t} · {'—'}</div>\n`
    )
    const findings = await runBlockChecks(root)
    assert.equal(
      findings.some((f) => f.id === 'block-literal-string'),
      false
    )
  })

  test('missing stories is a warning and the block is still productized', async () => {
    const root = await project()
    await write(root, 'src/blocks/Card.tsx', clean)
    const findings = await runBlockChecks(root)
    assert.equal(
      findings.find((f) => f.id === 'block-missing-stories')?.severity,
      'warn'
    )
    assert.equal(
      findings.find((f) => f.id === 'block-productized')?.severity,
      'info'
    )
  })

  test('a block with stories has no warning', async () => {
    const root = await project()
    await write(root, 'src/blocks/Card.tsx', clean)
    await write(root, 'src/blocks/Card.stories.tsx', `export default {}\n`)
    const findings = await runBlockChecks(root)
    assert.equal(
      findings.some((f) => f.id === 'block-missing-stories'),
      false
    )
    assert.equal(
      findings.some((f) => f.id === 'block-productized'),
      true
    )
  })

  test('stories and tests are not blocks', async () => {
    const root = await project()
    await write(
      root,
      'src/blocks/Card.stories.tsx',
      `export const S = () => <p>Hello</p>\n`
    )
    assert.deepEqual(await runBlockChecks(root), [])
  })
})
