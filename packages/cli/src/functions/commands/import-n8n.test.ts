import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from 'fs/promises'
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

const listAll = async (dir: string): Promise<string[]> => {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await listAll(full)))
    else out.push(full)
  }
  return out
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
  test('an output dir under /functions/ does not count graph files as stubs', async () => {
    const file = join(base, 'single.json')
    await writeFile(file, JSON.stringify(workflow('Epsilon')), 'utf-8')
    const out = join(base, 'packages', 'functions', 'src')
    const { logger, info } = fakeLogger()

    await (pikkuImportN8n as any).func({ logger, config: {} }, { file, out })

    assert.ok(
      !info.some((m) => /stub function/.test(m)),
      'a stub-free import must not report stubs'
    )
  })

  test('writes the start wiring, drops an unpublished addon, and says what to install next', async () => {
    const { createServer } = await import('http')
    const server = createServer((req, res) => {
      const q = new URL(req.url!, 'http://x').searchParams.get('query')
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify(q === 'gmail' ? [{ name: '@pikku/addon-gmail' }] : [])
      )
    })
    await new Promise<void>((r) => server.listen(0, r))
    const registry = `http://localhost:${(server.address() as { port: number }).port}`
    try {
      const wf = {
        name: 'Mixed',
        nodes: [
          {
            id: 't',
            name: 'Webhook',
            type: 'n8n-nodes-base.webhook',
            typeVersion: 1,
            position: [0, 0],
            parameters: { path: 'mixed', httpMethod: 'POST' },
          },
          {
            id: 'g',
            name: 'Send',
            type: 'n8n-nodes-base.gmail',
            typeVersion: 2.1,
            position: [200, 0],
            parameters: { sendTo: 'a@b.co', subject: 's', message: 'm' },
            credentials: { gmailOAuth2: { id: '1', name: 'g' } },
          },
          {
            id: 'p',
            name: 'Deal',
            type: 'n8n-nodes-base.pipedrive',
            typeVersion: 1,
            position: [400, 0],
            parameters: { resource: 'deal', operation: 'create' },
            credentials: { pipedriveApi: { id: '2', name: 'p' } },
          },
        ],
        connections: {
          Webhook: { main: [[{ node: 'Send', type: 'main', index: 0 }]] },
          Send: { main: [[{ node: 'Deal', type: 'main', index: 0 }]] },
        },
      }
      const file = join(base, 'mixed.json')
      await writeFile(file, JSON.stringify(wf), 'utf-8')
      const out = join(base, 'out')
      const { logger, info } = fakeLogger()
      await (pikkuImportN8n as any).func(
        { logger, config: { registry } },
        { file, out }
      )

      const files = (await listAll(out)).map((f) => f.slice(out.length))
      assert.ok(
        files.some((f) => f.endsWith('mixed.start.ts')),
        files.join(',')
      )
      const start = await readFile(
        join(out, 'mixed', 'mixed.start.ts'),
        'utf-8'
      )
      assert.match(start, /route: "\/mixed"/)
      const gen = files.find((f) => f.endsWith('.addons.gen.ts'))
      if (gen)
        assert.doesNotMatch(
          await readFile(join(out, gen), 'utf-8'),
          /pipedrive/
        )
      const text = info.join('\n')
      assert.match(text, /no published addon for @pikku\/addon-pipedrive/)
      assert.match(text, /next: pikku addons add gmail\s+then\s+pikku all/)
      assert.doesNotMatch(text, /addons add pipedrive/)
    } finally {
      server.close()
    }
  })
})
