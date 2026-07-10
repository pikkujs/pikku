import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseN8n } from './parse-n8n.js'
import { generateWorkflowFromN8n } from './codegen.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures')
const loadFixture = (name: string) =>
  JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'))

test('linear set/code/integration workflow → pure graph', () => {
  const parsed = parseN8n(loadFixture('linear-set-code.json'))
  assert.equal(parsed.shape, 'pure-graph')

  const { files, manifest } = generateWorkflowFromN8n(parsed)

  const graph = files['leadEnrichment/leadEnrichment.graph.ts']
  assert.ok(graph, 'graph file emitted')
  assert.match(graph, /pikkuWorkflowGraph\(/)
  // Set node → passthrough rpc + its two assembled fields as input
  assert.match(graph, /setFields: "n8nPassthrough"/)
  assert.match(graph, /sendGmail: "gmail__sendGmail"/)
  assert.match(graph, /score: "codeStubScore"/)
  // Tier-1 ref, Tier-2 template
  assert.match(graph, /"email": ref\("trigger", "body\.email"\)/)
  assert.match(
    graph,
    /"greeting": template\("Hello \$0", \[ref\("trigger", "body\.name"\)\]\)/
  )
  // integration cross-node ref
  assert.match(graph, /"sendTo": ref\("setFields", "email"\)/)
  // node-level note preserved
  assert.match(graph, /notes: "sends the welcome email"/)
  // topology
  assert.match(graph, /setFields: \{[\s\S]*next: "sendGmail"/)
  assert.match(graph, /sendGmail: \{[\s\S]*next: "score"/)
  // template import pulled in
  assert.match(graph, /import \{ template \} from '@pikku\/core\/workflow'/)

  // passthrough function emitted once
  assert.ok(files['leadEnrichment/functions/n8nPassthrough.function.ts'])

  // integration stub
  const gmail = files['leadEnrichment/functions/gmail__sendGmail.function.ts']
  assert.ok(gmail)
  assert.match(gmail, /STUB — generated from n8n node "Send Gmail"/)
  assert.match(gmail, /throw new Error\("gmail__sendGmail — implement me"\)/)

  // code stub preserves original JS verbatim
  const code = files['leadEnrichment/functions/codeStubScore.function.ts']
  assert.ok(code)
  assert.match(code, /Original n8n JavaScript/)
  assert.match(code, /i\.json\.value \* 2/)

  // manifest: gmail is the one integration node
  assert.equal(manifest.length, 1)
  assert.equal(manifest[0]!.rpcName, 'gmail__sendGmail')
  assert.equal(manifest[0]!.isAgentTool, false)
  assert.equal(manifest[0]!.n8nType, 'n8n-nodes-base.gmail')
  assert.ok(files['leadEnrichment/leadEnrichment.integrations.json'])
})

test('agent + tool workflow → agent-only, no graph', () => {
  const parsed = parseN8n(loadFixture('agent-with-tool.json'))
  assert.equal(parsed.shape, 'agent-only')

  const { files, manifest } = generateWorkflowFromN8n(parsed)

  // no graph for an agent-only workflow
  assert.ok(!files['supportAssistant/supportAssistant.graph.ts'])

  const agent = files['supportAssistant/supportAssistant.agent.ts']
  assert.ok(agent, 'agent file emitted')
  assert.match(agent, /pikkuAIAgent\(/)
  assert.match(agent, /goal: "You are a helpful support assistant/)
  // the ai_tool node is a ref in tools[], not a graph node
  assert.match(agent, /ref\("httpRequestTool__lookupOrder"\)/)

  // tool stub emitted
  assert.ok(
    files['supportAssistant/functions/httpRequestTool__lookupOrder.function.ts']
  )

  // manifest tool entry marked as agent tool
  assert.equal(manifest.length, 1)
  assert.equal(manifest[0]!.isAgentTool, true)
  assert.equal(manifest[0]!.agentName, 'supportAssistant')
})
