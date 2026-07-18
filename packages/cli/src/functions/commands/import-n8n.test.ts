import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { pikkuImportN8n } from './import-n8n.js'

const workflow = (name: string) => ({
  name,
  nodes: [
    {
      id: 't',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [0, 0],
      parameters: { path: name.toLowerCase() },
    },
    {
      id: 's',
      name: 'Edit Fields',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [200, 0],
      parameters: {
        mode: 'manual',
        options: {},
        assignments: {
          assignments: [
            { id: 'a1', name: 'product', type: 'string', value: 'widget' },
          ],
        },
      },
    },
  ],
  connections: {
    Webhook: { main: [[{ node: 'Edit Fields', type: 'main', index: 0 }]] },
  },
})

const fakeLogger = () => {
  const info: string[] = []
  const error: string[] = []
  return {
    logger: {
      info: (m: string) => info.push(m),
      error: (m: string) => error.push(m),
      warn: () => {},
      debug: () => {},
    },
    info,
    error,
  }
}

const graphFiles = async (dir: string): Promise<string[]> => {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await graphFiles(full)))
    else if (entry.name.endsWith('.graph.ts')) out.push(full)
  }
  return out
}

describe('pikkuImportN8n — batch import', () => {
  let base: string
  let originalExit: typeof process.exit

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'n8n-import-'))
    originalExit = process.exit
    process.exit = ((code?: number) => {
      throw new Error(`process.exit(${code}) called`)
    }) as typeof process.exit
  })

  afterEach(async () => {
    process.exit = originalExit
    await rm(base, { recursive: true, force: true })
  })

  test('an array export writes one scaffold per workflow', async () => {
    const file = join(base, 'export.json')
    await writeFile(
      file,
      JSON.stringify([workflow('Alpha'), workflow('Beta')]),
      'utf-8'
    )
    const out = join(base, 'out')
    const { logger, info } = fakeLogger()

    await (pikkuImportN8n as any).func({ logger, config: {} }, { file, out })

    const graphs = await graphFiles(out)
    assert.equal(
      graphs.length,
      2,
      `expected 2 graph files, got ${graphs.length}`
    )
    assert.ok(
      graphs.some((g) => g.includes('alpha')) &&
        graphs.some((g) => g.includes('beta')),
      'both workflows should be scaffolded into their own slug dirs'
    )
    assert.ok(
      info.some((m) => /2\b/.test(m) && /[Ii]mport/.test(m)),
      'should log a batch summary'
    )
  })

  test('a directory of workflow files imports each *.json', async () => {
    const dir = join(base, 'workflows')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'one.json'), JSON.stringify(workflow('Gamma')))
    await writeFile(join(dir, 'two.json'), JSON.stringify(workflow('Delta')))
    // a non-json file must be ignored
    await writeFile(join(dir, 'README.md'), '# not a workflow')
    const out = join(base, 'out')
    const { logger } = fakeLogger()

    await (pikkuImportN8n as any).func(
      { logger, config: {} },
      { file: dir, out }
    )

    const graphs = await graphFiles(out)
    assert.equal(
      graphs.length,
      2,
      `expected 2 graph files, got ${graphs.length}`
    )
    assert.ok(
      graphs.some((g) => g.includes('gamma')) &&
        graphs.some((g) => g.includes('delta'))
    )
  })

  test('a single-workflow file still imports (one scaffold)', async () => {
    const file = join(base, 'single.json')
    await writeFile(file, JSON.stringify(workflow('Solo')))
    const out = join(base, 'out')
    const { logger } = fakeLogger()

    await (pikkuImportN8n as any).func({ logger, config: {} }, { file, out })

    const graphs = await graphFiles(out)
    assert.equal(graphs.length, 1)
    assert.ok(graphs[0]!.includes('solo'))
  })
})
