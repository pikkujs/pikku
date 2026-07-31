import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { LocalMetaService } from './meta-service.js'

// knowledge: decisions/design/scenario-meta-lives-apart-from-app-meta-but-merges-when-read-off-disk.md
describe('LocalMetaService reads the scenario meta alongside the app meta', () => {
  let pikkuDir: string

  before(async () => {
    pikkuDir = await mkdtemp(join(tmpdir(), 'pikku-meta-'))
    await mkdir(join(pikkuDir, 'workflow', 'meta'), { recursive: true })
    await mkdir(join(pikkuDir, 'scenarios', 'meta'), { recursive: true })
    await mkdir(join(pikkuDir, 'function'), { recursive: true })
    await mkdir(join(pikkuDir, 'scenarios'), { recursive: true })

    await writeFile(
      join(pikkuDir, 'workflow', 'meta', 'orderWorkflow.gen.json'),
      JSON.stringify({ name: 'orderWorkflow', source: 'dsl' })
    )
    await writeFile(
      join(pikkuDir, 'scenarios', 'meta', 'codeEditorScenario.gen.json'),
      JSON.stringify({ name: 'codeEditorScenario', source: 'scenario' })
    )
    await writeFile(
      join(pikkuDir, 'function', 'pikku-functions-meta.gen.json'),
      JSON.stringify({ createTodo: { pikkuFuncId: 'createTodo' } })
    )
    await writeFile(
      join(pikkuDir, 'scenarios', 'pikku-scenario-functions-meta.gen.json'),
      JSON.stringify({
        opensPage: { pikkuFuncId: 'opensPage', scenarioStep: true },
      })
    )
  })

  after(async () => {
    await rm(pikkuDir, { recursive: true, force: true })
  })

  test('a scenario is still a workflow to whoever reads the meta', async () => {
    const meta = await new LocalMetaService(pikkuDir).getWorkflowMeta()
    assert.deepEqual(Object.keys(meta).sort(), [
      'codeEditorScenario',
      'orderWorkflow',
    ])
    assert.equal(meta['codeEditorScenario']!.source, 'scenario')
  })

  test('a scenario step is still a function to whoever reads the meta', async () => {
    const meta = await new LocalMetaService(pikkuDir).getFunctionsMeta()
    assert.deepEqual(Object.keys(meta).sort(), ['createTodo', 'opensPage'])
    assert.equal(meta['opensPage']!.scenarioStep, true)
  })

  test('a project with no scenarios reads exactly what it has', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'pikku-meta-empty-'))
    await mkdir(join(empty, 'workflow', 'meta'), { recursive: true })
    await writeFile(
      join(empty, 'workflow', 'meta', 'orderWorkflow.gen.json'),
      JSON.stringify({ name: 'orderWorkflow', source: 'dsl' })
    )

    const service = new LocalMetaService(empty)
    assert.deepEqual(Object.keys(await service.getWorkflowMeta()), [
      'orderWorkflow',
    ])
    assert.deepEqual(Object.keys(await service.getFunctionsMeta()), [])

    await rm(empty, { recursive: true, force: true })
  })
})
