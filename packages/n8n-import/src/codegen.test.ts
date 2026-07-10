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
  // Set node → @pikku/addon-graph's native editFields, its two assignments
  // lowered to `set` operations
  assert.match(graph, /setFields: "graph:editFields"/)
  assert.match(graph, /sendGmail: "gmail__sendGmail"/)
  assert.match(graph, /score: "codeStubScore"/)
  assert.match(graph, /item: \{\}/)
  // Tier-1 ref, Tier-2 template — as `set` operation values
  assert.match(
    graph,
    /field: "email", operation: "set" as const, value: ref\("trigger", "body\.email"\)/
  )
  assert.match(
    graph,
    /field: "greeting", operation: "set" as const, value: template\("Hello \$0", \[ref\("trigger", "body\.name"\)\]\)/
  )
  // integration cross-node ref — editFields wraps its output in `item`, so a
  // downstream ref to a Set node is prefixed with `item.`
  assert.match(graph, /"sendTo": ref\("setFields", "item\.email"\)/)
  // node-level note preserved
  assert.match(graph, /notes: "sends the welcome email"/)
  // topology
  assert.match(graph, /setFields: \{[\s\S]*next: "sendGmail"/)
  assert.match(graph, /sendGmail: \{[\s\S]*next: "score"/)
  // template import pulled in
  assert.match(graph, /import \{ template \} from '@pikku\/core\/workflow'/)

  // no passthrough stub — Set nodes use @pikku/addon-graph's editFields
  assert.ok(!files['leadEnrichment/functions/n8nPassthrough.function.ts'])

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

test('modern Edit Fields (Set v3.4) unwraps assignments.assignments into per-field set operations', () => {
  const parsed = parseN8n(loadFixture('set-edit-fields.json'))
  const { files } = generateWorkflowFromN8n(parsed)

  const graph = files['editFieldsDemo/editFieldsDemo.graph.ts']
  assert.ok(graph, 'graph file emitted')
  assert.match(graph, /editFields: "graph:editFields"/)

  // each assignment becomes its own set operation, classified individually
  assert.match(
    graph,
    /field: "product", operation: "set" as const, value: "widget"/
  )
  assert.match(
    graph,
    /field: "email", operation: "set" as const, value: ref\("trigger", "body\.email"\)/
  )
  assert.match(
    graph,
    /field: "greeting", operation: "set" as const, value: template\("Hi \$0", \[ref\("trigger", "body\.name"\)\]\)/
  )

  // the raw n8n containers must NOT leak through as fields
  assert.doesNotMatch(graph, /field: "assignments"/)
  assert.doesNotMatch(graph, /field: "options"/)
  assert.doesNotMatch(graph, /field: "mode"/)
})

test('code node with block comments escapes */ so the JSDoc stays valid', () => {
  const parsed = parseN8n(loadFixture('code-block-comment.json'))
  const { files } = generateWorkflowFromN8n(parsed)
  const code = files['commentEscaping/functions/codeStubTransform.function.ts']
  assert.ok(code)
  // the original code contains `*/` which must not terminate the JSDoc block
  const jsdoc = code.slice(code.indexOf('/**'), code.indexOf('*/\n'))
  assert.ok(
    !/\*\//.test(jsdoc.replace(/\*\\\//g, '')),
    'no raw */ inside JSDoc'
  )
  assert.match(code, /configure ===== \*\\\//)
})

test('graph-with-agent: graph references the agent by its registered name (#910)', () => {
  const parsed = parseN8n(
    JSON.parse(
      readFileSync(
        join(fixturesDir, '../fixtures-ai/graph-with-agent-seo-keywords.json'),
        'utf-8'
      )
    )
  )
  assert.equal(parsed.shape, 'graph-with-agent')

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files[`${parsed.slug}/${parsed.slug}.graph.ts`]
  const agent = files[`${parsed.slug}/${parsed.slug}.agent.ts`]
  assert.ok(graph && agent, 'graph + agent files emitted')

  // the agent is exported as `<slug>Agent` — the AgentMap key
  assert.match(
    agent,
    new RegExp(`export const ${parsed.slug}Agent = pikkuAIAgent`)
  )
  // the graph node for the agent references that exported const — an agent is a
  // native graph node (#910), not a stub rpc like "agent__aiAgent"
  const agentNodeId = parsed.agentNode!.nodeId
  assert.match(graph, new RegExp(`${agentNodeId}: "${parsed.slug}Agent"`))
  assert.doesNotMatch(graph, /agent__/)
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
