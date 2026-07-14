import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseN8n } from './parse-n8n.js'
import { planSubWorkflows, subWorkflowParsed } from './subworkflow.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures')
const load = (name: string) =>
  parseN8n(JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8')))

test('planSubWorkflows lifts a self toolWorkflow body reachable from its trigger', () => {
  const parsed = load('self-workflow-tool.json')
  const plan = planSubWorkflows(parsed)

  assert.equal(plan.subWorkflows.length, 1)
  const sub = plan.subWorkflows[0]!
  assert.equal(sub.name, `${parsed.slug}_fetchPage`)

  // body = Build Config + Fetch (reachable from the executeWorkflowTrigger),
  // NOT the agent-branch nodes
  const nameById = new Map(parsed.nodes.map((n) => [n.nodeId, n.name]))
  const memberNames = new Set(
    [...sub.memberNodeIds].map((id) => nameById.get(id))
  )
  assert.deepEqual(memberNames, new Set(['Build Config', 'Fetch']))

  // the self tool maps to the sub-workflow name
  const toolId = parsed.nodes.find((n) => n.name === 'Fetch Page Tool')!.nodeId
  assert.equal(plan.toolToWorkflow.get(toolId), sub.name)

  // the trigger is consumed, the body is extracted from the main graph
  assert.ok(plan.triggerNodeIds.has(sub.triggerNodeId))
  assert.equal(plan.extractedNodeIds.size, 2)
})

test('subWorkflowParsed yields a pure graph of just the trigger + body', () => {
  const parsed = load('self-workflow-tool.json')
  const sub = planSubWorkflows(parsed).subWorkflows[0]!
  const subParsed = subWorkflowParsed(parsed, sub)

  assert.equal(subParsed.shape, 'pure-graph')
  assert.equal(subParsed.agentNode, undefined)
  assert.deepEqual(
    new Set(subParsed.nodes.map((n) => n.name)),
    new Set(['When Executed by Another Workflow', 'Build Config', 'Fetch'])
  )
  // no agent-branch connections leak in
  assert.ok(!subParsed.connections['Chat Trigger'])
})

test('planSubWorkflows is a no-op without a self toolWorkflow', () => {
  const parsed = load('agent-with-tool.json') // httpRequestTool, no self workflow
  const plan = planSubWorkflows(parsed)
  assert.equal(plan.subWorkflows.length, 0)
  assert.equal(plan.extractedNodeIds.size, 0)
  assert.equal(plan.toolToWorkflow.size, 0)
})
