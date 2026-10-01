import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { LocalMetaService } from '../../services/meta-service.js'
import {
  aggregateScenarioCoverageGaps,
  readScenarioCoverage,
  routeMatchesPath,
} from './scenario-coverage.js'

const writeJson = async (dir: string, file: string, value: unknown) => {
  await mkdir(join(dir, file, '..'), { recursive: true })
  await writeFile(join(dir, file), JSON.stringify(value))
}

describe('aggregateScenarioCoverageGaps', () => {
  test('a line is covered when any scenario reaches it', () => {
    const gaps = aggregateScenarioCoverageGaps({
      generatedAt: '',
      environment: 'local',
      scenarios: {
        a: {
          functions: [
            {
              name: 'createTodo',
              sourceFile: 'todo.ts',
              status: 'partial',
              totalLines: 10,
              missedLines: [3, 4, 5, 9],
            },
          ],
        },
        b: {
          functions: [
            {
              name: 'createTodo',
              sourceFile: 'todo.ts',
              status: 'partial',
              totalLines: 10,
              missedLines: [4, 5, 9],
            },
            {
              name: 'deleteTodo',
              sourceFile: 'todo.ts',
              status: 'uncovered',
              totalLines: 2,
              missedLines: [1, 2],
            },
          ],
        },
      },
    })

    assert.deepEqual(
      gaps.map((gap) => [gap.function, gap.status, gap.missing]),
      [
        ['deleteTodo', 'uncovered', ['L1-2']],
        ['createTodo', 'partial', ['L4-5', 'L9']],
      ]
    )
  })
})

describe('readScenarioCoverage', () => {
  let pikkuDir: string

  before(async () => {
    pikkuDir = await mkdtemp(join(tmpdir(), 'pikku-scenario-coverage-'))
    await writeJson(pikkuDir, 'function/pikku-functions-meta.gen.json', {
      createTodo: { pikkuFuncId: 'createTodo', sourceFile: 'todo.ts' },
      deleteTodo: { pikkuFuncId: 'deleteTodo', sourceFile: 'todo.ts' },
      listTodos: { pikkuFuncId: 'listTodos', sourceFile: 'todo.ts' },
      trackEvent: { pikkuFuncId: 'trackEvent', sourceFile: 'a.gen.ts' },
      saveDraft: {
        pikkuFuncId: 'saveDraft',
        sourceFile: 'draft.ts',
        expose: false,
      },
    })
    await writeJson(pikkuDir, 'rpc/pikku-rpc-wirings-meta.internal.gen.json', {
      createTodo: 'createTodo',
      deleteTodo: 'deleteTodo',
      listTodos: 'listTodos',
      trackEvent: 'trackEvent',
      archiveList: 'archiveList',
    })
    await writeJson(pikkuDir, 'http/pikku-http-wirings-meta.gen.json', {
      post: { '/lists/archive': { pikkuFuncId: 'archiveList' } },
    })
    await writeJson(pikkuDir, 'scenarios/meta/todoScenario.gen.json', {
      name: 'todoScenario',
      source: 'scenario',
      nodes: {
        open: { rpcName: 'opensPage', input: { path: '/todos/' } },
        create: { rpcName: 'createTodo' },
      },
    })
  })

  after(async () => {
    await rm(pikkuDir, { recursive: true, force: true })
  })

  test('names every mutation no scenario drives', async () => {
    const coverage = await readScenarioCoverage(new LocalMetaService(pikkuDir))

    assert.deepEqual(coverage.mutations, {
      required: 3,
      covered: 1,
      uncovered: [
        { id: 'archiveList' },
        { id: 'deleteTodo', sourceFile: 'todo.ts' },
      ],
    })
    assert.equal(coverage.api, null)
  })

  test('reports unvisited routes only when it is told the routes', async () => {
    const meta = new LocalMetaService(pikkuDir)

    assert.deepEqual((await readScenarioCoverage(meta)).routes, {
      visited: ['/todos'],
      total: null,
      unvisited: null,
    })
    assert.deepEqual(
      (await readScenarioCoverage(meta, { routes: ['/', '/todos'] })).routes,
      { visited: ['/todos'], total: 2, unvisited: ['/'] }
    )
  })

  test('a route with params is visited by any path it serves', () => {
    assert.equal(routeMatchesPath('/todos/$id', '/todos/7'), true)
    assert.equal(routeMatchesPath('/todos/$id', '/todos'), false)
    assert.equal(routeMatchesPath('/files/$', '/files/a/b'), true)
    assert.equal(routeMatchesPath('/{-$lang}/about', '/about'), true)
    assert.equal(routeMatchesPath('/{-$lang}/about', '/de/about'), true)
    assert.equal(routeMatchesPath('/app/', '/app?tab=1'), true)
  })

  test('reads line coverage once a covered run has recorded it', async () => {
    await writeJson(pikkuDir, 'coverage/scenario-coverage.json', {
      generatedAt: '2026-10-01T00:00:00.000Z',
      environment: 'local',
      scenarios: {
        todoScenario: {
          summary: { total: 4 },
          functions: [
            {
              name: 'deleteTodo',
              sourceFile: 'todo.ts',
              status: 'uncovered',
              totalLines: 3,
              missedLines: [1, 2, 3],
            },
          ],
        },
      },
    })

    const { api } = await readScenarioCoverage(new LocalMetaService(pikkuDir))

    assert.equal(api?.total, 4)
    assert.equal(api?.covered, 3)
    assert.equal(api?.pct, 75)
    assert.deepEqual(
      api?.gaps.map((gap) => gap.function),
      ['deleteTodo']
    )
  })
})
