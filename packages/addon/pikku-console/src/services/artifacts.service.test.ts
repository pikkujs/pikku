import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { ArtifactsService } from './artifacts.service.js'

describe('ArtifactsService', () => {
  test('lists pages and documents, newest first, and refuses paths outside artifacts/', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-console-artifacts-'))
    await mkdir(join(root, 'artifacts/poster'), { recursive: true })
    await mkdir(join(root, 'artifacts/letter'), { recursive: true })
    await writeFile(join(root, 'artifacts/poster/index.html'), '<title>Spring poster</title><p>Hi</p>')
    await writeFile(join(root, 'artifacts/poster/artifact.json'), JSON.stringify({ kind: 'Design', summary: 'A poster' }))
    await new Promise((r) => setTimeout(r, 20))
    await writeFile(join(root, 'artifacts/letter/doc.md'), '# Welcome\n\nHello')
    const service = new ArtifactsService(root)
    const list = await service.list()
    assert.deepStrictEqual(list.map((a) => [a.id, a.kind, a.title]), [['letter', 'Document', 'Welcome'], ['poster', 'Design', 'Spring poster']])
    assert.strictEqual((await service.get('poster'))?.html, '<title>Spring poster</title><p>Hi</p>')
    assert.strictEqual(await service.get('../poster'), null)
    assert.deepStrictEqual(await new ArtifactsService(join(root, 'none')).list(), [])
  })
})
