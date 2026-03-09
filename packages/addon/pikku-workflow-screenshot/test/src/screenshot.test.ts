import '../.pikku/pikku-bootstrap.gen.js'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { stopSingletonServices } from '@pikku/core'
import { LocalVariablesService } from '@pikku/core/services'
import { rpcService } from '@pikku/core/rpc'
import { createSingletonServices } from './services.js'

const sampleWorkflow = {
  name: 'testWorkflow',
  nodes: {
    step1: {
      rpcName: 'doSomething',
      stepName: 'step1',
      next: 'step2',
    },
    step2: {
      rpcName: 'doSomethingElse',
      stepName: 'step2',
    },
  },
  entryNodeIds: ['step1'],
  wires: {
    http: [
      {
        method: 'POST',
        route: '/test',
        startNode: 'step1',
      },
    ],
  },
}

test('renderWorkflowImage - errors when console is not reachable', async () => {
  const variables = new LocalVariablesService({
    PIKKU_CONSOLE_URL: 'http://localhost:9999',
  })

  const singletonServices = await createSingletonServices({}, { variables })
  const rpc = rpcService.getContextRPCService(singletonServices as any, {})

  try {
    await rpc.invoke('workflow-screenshot:renderWorkflowImage', {
      workflowData: sampleWorkflow,
    })
    assert.fail('Should have thrown an error')
  } catch (e: any) {
    assert.ok(
      e.message.includes('Chromium') ||
        e.message.includes('browser') ||
        e.message.includes('ERR_CONNECTION_REFUSED'),
      `Expected chromium or connection error, got: ${e.message}`
    )
  } finally {
    await stopSingletonServices()
  }
})

test(
  'renderWorkflowImage - renders and stores screenshot',
  { skip: !process.env.PIKKU_CONSOLE_URL },
  async () => {
    const consoleUrl = process.env.PIKKU_CONSOLE_URL!

    const uploadPath = join(tmpdir(), 'pikku-screenshot-test')
    const variables = new LocalVariablesService({
      PIKKU_CONSOLE_URL: consoleUrl,
    })

    const singletonServices = await createSingletonServices({}, { variables })
    const rpc = rpcService.getContextRPCService(singletonServices as any, {})

    try {
      const result = await rpc.invoke(
        'workflow-screenshot:renderWorkflowImage',
        {
          workflowData: sampleWorkflow,
          assetKey: 'test-workflow.png',
        }
      )

      assert.equal(result.assetKey, 'test-workflow.png')
      assert.ok(result.url, 'Should return a signed URL')

      const filePath = join(uploadPath, 'test-workflow.png')
      assert.ok(
        existsSync(filePath),
        `Screenshot file should exist at ${filePath}`
      )

      console.log(`  ✓ Screenshot saved to ${filePath}`)
    } finally {
      await stopSingletonServices()
    }
  }
)
