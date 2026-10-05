import assert from 'node:assert'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  LocalChangesStore,
  LocalProjectFile,
  LocalWishStore,
  resolveStudioHost,
} from './studio-host.service.js'

const root = () => mkdtemp(join(tmpdir(), 'pikku-console-studio-'))

describe('LocalChangesStore', () => {
  test('creates, moves and completes a change on disk', async () => {
    const dir = await root()
    const store = new LocalChangesStore(dir)
    const change = await store.create({ title: 'Bigger logo', route: '/' })
    assert.equal(change.status, 'open')
    await store.setStatus(change.changeId, 'in_progress')
    await store.complete(change.changeId, 'Done')
    const again = new LocalChangesStore(dir)
    assert.equal((await again.get(change.changeId))?.status, 'done')
    assert.deepEqual(await again.list(['open']), [])
  })

  test('refuses an unknown change', async () => {
    const store = new LocalChangesStore(await root())
    await assert.rejects(store.setStatus('nope', 'open'))
  })
})

const fakeModel = async (content: unknown) => {
  const requests: any[] = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      requests.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) })
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    requests,
    close: () => server.close(),
    access: async () => ({
      proxyUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: 'sk-test',
      model: 'test-model',
    }),
  }
}

const until = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 100; i++) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('timed out')
}

describe('LocalWishStore', () => {
  test('records a reaction', async () => {
    const store = new LocalWishStore(await root())
    await store.save([{ title: 'Dark mode', line: 'For late nights', reaction: null }])
    await store.react('Dark mode', 'liked')
    assert.equal((await store.list()).wishes[0]?.reaction, 'liked')
  })

  test('has nothing to grow without an idea', async () => {
    const list = await new LocalWishStore(await root()).list()
    assert.deepEqual(list, { wishes: [], status: 'unavailable', reason: 'no-idea' })
  })

  test('needs a model to grow the idea', async () => {
    const dir = await root()
    const project = new LocalProjectFile(dir)
    await project.update({ idea: 'A watering log for my plants' })
    const list = await new LocalWishStore(dir, async () => null, project).list()
    assert.equal(list.reason, 'no-model')
  })

  test('grows the idea in the background and names the project', async () => {
    const dir = await root()
    const project = new LocalProjectFile(dir)
    await project.update({ idea: 'A watering log for my plants' })
    const model = await fakeModel({
      name: 'Watering Log',
      aspirations: [
        { title: 'Log a watering', line: 'People can note when they watered a plant' },
        { title: 'Reminders', line: 'People get a nudge when a plant is due' },
      ],
    })
    try {
      const store = new LocalWishStore(dir, model.access, project)
      assert.equal((await store.list()).status, 'generating')
      await until(async () => (await store.list()).status === 'ready')
      const list = await store.list()
      assert.equal(list.wishes.length, 2)
      assert.equal((await project.read()).name, 'Watering Log')
      assert.equal(model.requests.length, 1)
      assert.equal(model.requests[0].url, '/v1/chat/completions')
      assert.equal(model.requests[0].auth, 'Bearer sk-test')
      assert.match(model.requests[0].body.messages[1].content, /watering log/)
    } finally {
      model.close()
    }
  })
})

describe('Studio AI choice', () => {
  const withEnv = async (env: Record<string, string>, run: () => Promise<void>) => {
    const saved = { ...process.env }
    Object.assign(process.env, env)
    try {
      await run()
    } finally {
      for (const key of Object.keys(env)) delete process.env[key]
      Object.assign(process.env, saved)
    }
  }

  test('uses the key Studio hands the project', () =>
    withEnv(
      {
        PIKKU_STUDIO_AI: 'key',
        PIKKU_STUDIO_AI_KEY: 'sk-x',
        PIKKU_STUDIO_AI_BASE_URL: 'https://api.x.ai/v1',
        PIKKU_STUDIO_MODEL: 'grok-3-mini',
      },
      async () => {
        const host = await resolveStudioHost(await root())
        assert.deepEqual(await host.models(), {
          proxyUrl: 'https://api.x.ai/v1',
          apiKey: 'sk-x',
          model: 'grok-3-mini',
        })
      }
    ))

  test('a subscription says why there are no ideas', () =>
    withEnv({ PIKKU_STUDIO_AI: 'subscription', OPENAI_API_KEY: 'sk-ignored' }, async () => {
      const dir = await root()
      await new LocalProjectFile(dir).update({ idea: 'A plant log' })
      const host = await resolveStudioHost(dir)
      assert.equal(await host.models(), null)
      assert.equal((await host.wishes.list()).reason, 'subscription')
    }))
})

describe('resolveStudioHost', () => {
  test('is local when nothing links the project to Fabric', async () => {
    const key = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    const host = await resolveStudioHost(await root())
    if (key) process.env.OPENAI_API_KEY = key
    assert.equal(host.mode, 'local')
    assert.equal(host.projectId, null)
    assert.equal(await host.models(), null)
  })
})
