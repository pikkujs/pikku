import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectDeclaresBetterAuth } from './detect-better-auth.js'

test('a project that lives under a .pikku directory is still scanned', async () => {
  const base = await mkdtemp(join(tmpdir(), 'detect-ba-'))
  const root = join(base, '.pikku', 'studio', 'worktrees', 'p')
  try {
    await mkdir(join(root, 'src', '.pikku'), { recursive: true })
    await writeFile(join(root, 'src', '.pikku', 'gen.ts'), 'pikkuBetterAuth(')
    assert.equal(await projectDeclaresBetterAuth(root, ['src']), false)
    await writeFile(join(root, 'src', 'auth.ts'), 'export const auth = pikkuBetterAuth({})')
    assert.equal(await projectDeclaresBetterAuth(root, ['src']), true)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})
