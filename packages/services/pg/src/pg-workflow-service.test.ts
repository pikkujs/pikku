import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { PgWorkflowService } from './pg-workflow-service.js'

describe('PgWorkflowService init schema', () => {
  test('includes suspended workflow and step statuses', async () => {
    const calls: string[] = []
    const sql = Object.assign((() => []) as any, {
      unsafe: async (query: string) => {
        calls.push(query)
      },
    })

    const service = new PgWorkflowService(sql as any, 'pikku_test', {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        setLevel: () => {},
      } as any,
    })
    await service.init()

    const query = calls.join('\n')
    assert.match(
      query,
      /workflow_status_enum AS ENUM \('running', 'suspended', 'completed', 'failed', 'cancelled'\)/
    )
    assert.match(
      query,
      /step_status_enum AS ENUM \('pending', 'running', 'scheduled', 'succeeded', 'failed', 'suspended'\)/
    )
    assert.match(
      query,
      /ALTER TYPE pikku_test\.workflow_status_enum ADD VALUE IF NOT EXISTS 'suspended'/
    )
    assert.match(
      query,
      /ALTER TYPE pikku_test\.step_status_enum ADD VALUE IF NOT EXISTS 'suspended'/
    )
  })
})
