import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'

import type { WorkflowRunService } from '../../wirings/workflow/workflow.types.js'
import type { ServiceTestConfig } from '../service-tests.js'

/** Conformance suite for `workflowRunService`. Runs only when a backend supplies one. */
export const defineWorkflowRunServiceTests = (
  name: string,
  workflowRunService: NonNullable<
    ServiceTestConfig['services']['workflowRunService']
  >
): void => {
  const factory = workflowRunService
  describe(`WorkflowRunService [${name}]`, () => {
    let runService: WorkflowRunService

    before(async () => {
      runService = await factory()
    })

    test('listRuns returns runs', async () => {
      const runs = await runService.listRuns()
      assert.ok(Array.isArray(runs))
      assert.ok(runs.length > 0)
    })

    test('listRuns with filter', async () => {
      const runs = await runService.listRuns({
        workflowName: 'test-workflow',
      })
      assert.ok(runs.every((r) => r.workflow === 'test-workflow'))
    })

    test('getDistinctWorkflowNames', async () => {
      const names = await runService.getDistinctWorkflowNames()
      assert.ok(Array.isArray(names))
      assert.ok(names.includes('test-workflow'))
    })

    test('deleteRun', async () => {
      const runs = await runService.listRuns({
        workflowName: 'status-workflow',
      })
      assert.ok(runs.length > 0)

      const deleted = await runService.deleteRun(runs[0]!.id)
      assert.equal(deleted, true)

      const afterDelete = await runService.getRun(runs[0]!.id)
      assert.equal(afterDelete, null)
    })

    test('deleteRun returns false for missing', async () => {
      const deleted = await runService.deleteRun('non-existent-id')
      assert.equal(deleted, false)
    })
  })
}
