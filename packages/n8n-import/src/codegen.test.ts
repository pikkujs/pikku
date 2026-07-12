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
  // Pipedrive has no addon and isn't in the integration-map → stays a stub.
  assert.match(graph, /createDeal: "pipedrive__createDeal"/)
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
  // integration cross-node ref — editFields exposes its result directly, so a
  // downstream ref into a Set node targets the field with no prefix
  assert.match(graph, /"email": ref\("setFields", "email"\)/)
  // node-level note preserved
  assert.match(graph, /notes: "creates the deal"/)
  // topology
  assert.match(graph, /setFields: \{[\s\S]*next: "createDeal"/)
  assert.match(graph, /createDeal: \{[\s\S]*next: "score"/)
  // template import pulled in
  assert.match(graph, /import \{ template \} from '@pikku\/core\/workflow'/)

  // no passthrough stub — Set nodes use @pikku/addon-graph's editFields
  assert.ok(!files['leadEnrichment/functions/n8nPassthrough.function.ts'])

  // integration stub
  const pipedrive =
    files['leadEnrichment/functions/pipedrive__createDeal.function.ts']
  assert.ok(pipedrive)
  assert.match(pipedrive, /STUB — generated from n8n node "Create Deal"/)
  assert.match(
    pipedrive,
    /throw new Error\("pipedrive__createDeal — implement me"\)/
  )

  // code stub preserves original JS verbatim
  const code = files['leadEnrichment/functions/codeStubScore.function.ts']
  assert.ok(code)
  assert.match(code, /Original n8n JavaScript/)
  assert.match(code, /i\.json\.value \* 2/)

  // manifest: pipedrive is the one integration node
  assert.equal(manifest.length, 1)
  assert.equal(manifest[0]!.rpcName, 'pipedrive__createDeal')
  assert.equal(manifest[0]!.isAgentTool, false)
  assert.equal(manifest[0]!.n8nType, 'n8n-nodes-base.pipedrive')
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

test('no-auth httpRequest → graph:httpRequest with mapped input; authed httpRequest stays a stub', () => {
  const parsed = parseN8n(loadFixture('http-request.json'))
  const { files, manifest } = generateWorkflowFromN8n(parsed)

  const graph = files['httpDemo/httpDemo.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // the no-auth node maps to the addon's native httpRequest — a shared RPC
  assert.match(graph, /fetchData: "graph:httpRequest"/)
  // method + literal url mapped through; the enum literal must not widen
  assert.match(graph, /method: "POST" as const/)
  assert.match(graph, /url: "https:\/\/api\.example\.com\/items"/)
  // headers / query built from n8n's keypair collections, values classified
  assert.match(
    graph,
    /headers: \{ "X-Token": ref\("trigger", "body\.token"\) \}/
  )
  assert.match(graph, /query: \{ "page": "1" \}/)
  // json body is a pure ref
  assert.match(graph, /body: ref\("trigger", "body"\)/)

  // httpRequest exposes the response body directly, so a downstream ref into
  // the http node's output targets the field with no prefix. The consumer here
  // is a mapped Slack node (`slack:chatPostMessage`), so the field key is the
  // addon's own `text` — an unquoted identifier from the integration-map spec.
  assert.match(graph, /notify: "slack:chatPostMessage"/)
  assert.match(graph, /text: ref\("fetchData", "id"\)/)

  // no stub for the no-auth http node — it uses the addon function
  assert.ok(!files['httpDemo/functions/graph:httpRequest.function.ts'])
  assert.equal(
    manifest.find((m) => m.rpcName === 'graph:httpRequest'),
    undefined
  )

  // the authenticated http node cannot be a random addon call — it stays a stub
  // (addon-map territory) and keeps its integration rpc name
  assert.match(graph, /authFetch: "httpRequest__authFetch"/)
  assert.ok(files['httpDemo/functions/httpRequest__authFetch.function.ts'])
  assert.ok(manifest.find((m) => m.rpcName === 'httpRequest__authFetch'))
})

test('noop nodes are dropped and their edges rewired through (A → noop → B ⇒ A → B)', () => {
  const parsed = parseN8n(loadFixture('noop-passthrough.json'))
  const { files } = generateWorkflowFromN8n(parsed)

  const graph = files['passthroughDemo/passthroughDemo.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // the two NoOp nodes leave no trace — no node entry, no throwing stub
  assert.doesNotMatch(graph, /noOp/)
  assert.ok(!files['passthroughDemo/functions/noOp__noOp.function.ts'])
  assert.ok(!files['passthroughDemo/functions/noOp__noOp2.function.ts'])

  // the real nodes remain, wired straight through the (removed) noops.
  // Pipedrive has no addon and isn't in the integration-map, so it stays a stub.
  assert.match(graph, /format: "graph:editFields"/)
  assert.match(graph, /createDeal: "pipedrive__createDeal"/)
  assert.match(graph, /format: \{[\s\S]*next: "createDeal"/)

  // predecessor rewiring survives the noop: Format's $json still resolves to the
  // trigger (Format's real predecessor is the webhook, via the dropped No Op)
  assert.match(
    graph,
    /field: "email", operation: "set" as const, value: ref\("trigger", "body\.email"\)/
  )
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

test('fixedCollection transforms (sort/renameKeys/aggregate/summarize) wire to graph fns with enum remap', () => {
  const parsed = parseN8n(loadFixture('collection-transforms.json'))
  assert.equal(parsed.shape, 'pure-graph')

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['collectionTransforms/collectionTransforms.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // all four wire to their existing @pikku/addon-graph functions — no stubs
  assert.match(graph, /sortIt: "graph:sort"/)
  assert.match(graph, /rename: "graph:renameKeys"/)
  assert.match(graph, /roll: "graph:aggregate"/)
  assert.match(graph, /stats: "graph:summarize"/)

  // sort: multi-row fixedCollection → array of objects, order enum remapped
  // (n8n ascending/descending → addon asc/desc), items from the predecessor
  assert.match(graph, /items: ref\("fetch"\)/)
  assert.match(
    graph,
    /sortBy: \[\{ field: "created", order: "desc" \}, \{ field: "name", order: "asc" \}\]/
  )

  // renameKeys: currentKey/newKey rows → oldKey/newKey mappings
  assert.match(graph, /mappings: \[\{ oldKey: "old", newKey: "new" \}\]/)

  // aggregate: single field picked (first), output field carried through
  assert.match(graph, /field: "id"/)
  assert.match(graph, /outputField: "ids"/)

  // summarize: aggregation enum remapped (average → avg)
  assert.match(
    graph,
    /aggregations: \[\{ field: "amount", operation: "avg", outputField: "amount" \}\]/
  )

  // none of the four leaves a throwing stub function behind
  assert.ok(!files['collectionTransforms/functions/sort__sortIt.function.ts'])
  assert.ok(
    !files['collectionTransforms/functions/aggregate__roll.function.ts']
  )
})
