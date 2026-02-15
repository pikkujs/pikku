import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function testAgentAIMiddleware(): Promise<boolean> {
  console.log('\n--- Testing AI Agent Middleware Metadata ---')

  const metaPath = join(
    __dirname,
    '../../.pikku/agent/pikku-agent-wirings-meta.gen.json'
  )
  const raw = await readFile(metaPath, 'utf-8')
  const metaData = JSON.parse(raw)

  let passed = true

  const testAgentMeta = metaData.agentsMeta['test-agent']
  if (!testAgentMeta) {
    console.log('  ✗ test-agent not found in agentsMeta')
    return false
  }

  if (!testAgentMeta.aiMiddleware) {
    console.log('  ✗ test-agent missing aiMiddleware field')
    return false
  }

  if (testAgentMeta.aiMiddleware.length !== 2) {
    console.log(
      `  ✗ test-agent should have 2 AI middleware, got ${testAgentMeta.aiMiddleware.length}`
    )
    passed = false
  } else {
    console.log('  ✓ test-agent has 2 AI middleware entries')
  }

  const first = testAgentMeta.aiMiddleware[0]
  if (
    first.type !== 'wire' ||
    first.name !== 'testAIMiddleware' ||
    first.inline !== false
  ) {
    console.log(
      `  ✗ First AI middleware should be {type:'wire', name:'testAIMiddleware', inline:false}, got ${JSON.stringify(first)}`
    )
    passed = false
  } else {
    console.log(
      '  ✓ First AI middleware is testAIMiddleware (wire, not inline)'
    )
  }

  const second = testAgentMeta.aiMiddleware[1]
  if (
    second.type !== 'wire' ||
    second.name !== 'secondAIMiddleware' ||
    second.inline !== false
  ) {
    console.log(
      `  ✗ Second AI middleware should be {type:'wire', name:'secondAIMiddleware', inline:false}, got ${JSON.stringify(second)}`
    )
    passed = false
  } else {
    console.log(
      '  ✓ Second AI middleware is secondAIMiddleware (wire, not inline)'
    )
  }

  if (testAgentMeta.channelMiddleware?.length !== 1) {
    console.log(
      `  ✗ test-agent should have 1 channel middleware, got ${testAgentMeta.channelMiddleware?.length}`
    )
    passed = false
  } else {
    console.log('  ✓ test-agent has 1 channel middleware entry')
  }

  const noAIMeta = metaData.agentsMeta['agent-no-ai-middleware']
  if (!noAIMeta) {
    console.log('  ✗ agent-no-ai-middleware not found in agentsMeta')
    passed = false
  } else if (noAIMeta.aiMiddleware) {
    console.log(
      `  ✗ agent-no-ai-middleware should have no aiMiddleware, got ${JSON.stringify(noAIMeta.aiMiddleware)}`
    )
    passed = false
  } else {
    console.log('  ✓ agent-no-ai-middleware correctly has no aiMiddleware')
  }

  console.log(
    `\n  AI Middleware metadata test: ${passed ? 'PASSED' : 'FAILED'}`
  )
  return passed
}
