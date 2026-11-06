import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InspectorSession } from './session.js'

const project = (): string => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pikku-session-')))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'package.json'), '{"name":"x","type":"module"}')
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'nodenext',
        moduleResolution: 'nodenext',
        strict: true,
        noEmit: true,
      },
      include: ['src'],
    })
  )
  writeFileSync(join(root, 'src/index.ts'), 'export const n: number = 1\n')
  return root
}

describe('InspectorSession', () => {
  test('checks unsaved content, then the saved file, over one process', async () => {
    const root = project()
    const session = new InspectorSession()
    try {
      const file = join(root, 'src/index.ts')
      const [d] = await session.typeDiagnostics(
        root,
        file,
        "export const n: number = 'x'\n"
      )
      assert.equal(d?.code, 2322)
      assert.equal(d?.startLine, 1)
      assert.equal(d?.severity, 'error')
      assert.deepEqual(await session.typeDiagnostics(root, file), [])
    } finally {
      session.close()
    }
  })

  test('answers concurrent requests by id', async () => {
    const root = project()
    const session = new InspectorSession()
    try {
      const file = join(root, 'src/index.ts')
      const [bad, good] = await Promise.all([
        session.typeDiagnostics(root, file, "export const n: number = 'x'\n"),
        session.typeDiagnostics(root, join(root, 'package.json')),
      ])
      assert.equal(bad.length, 1)
      assert.deepEqual(good, [])
    } finally {
      session.close()
    }
  })

  test('rejects pending calls and restarts when the process dies', async () => {
    const root = project()
    const session = new InspectorSession()
    try {
      const file = join(root, 'src/index.ts')
      assert.deepEqual(await session.typeDiagnostics(root, file), [])
      ;(session as any).child.kill('SIGKILL')
      await new Promise((r) => setTimeout(r, 100))
      assert.deepEqual(await session.typeDiagnostics(root, file), [])
    } finally {
      session.close()
    }
  })
})
