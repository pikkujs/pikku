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

  // pure code node → real translated function (not a throwing stub)
  const code = files['leadEnrichment/functions/codeStubScore.function.ts']
  assert.ok(code)
  assert.match(code, /Ported from n8n Code node "Score"/)
  assert.match(code, /i\.json\.value \* 2/)
  assert.doesNotMatch(code, /implement me/)
  assert.doesNotMatch(code, /Original n8n JavaScript/)
  assert.match(code, /const items = \$items/)

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

  // a genericCredentialType node with no resolvable auth subtype has no static
  // recipe, so it stays a stub (addon-map territory) with its integration rpc
  assert.match(graph, /authFetch: "httpRequest__authFetch"/)
  assert.ok(files['httpDemo/functions/httpRequest__authFetch.function.ts'])
  assert.ok(manifest.find((m) => m.rpcName === 'httpRequest__authFetch'))
})

test('authed httpRequest with a recipe → graph:httpRequest + auth descriptor, no wireAddon', () => {
  const parsed = parseN8n(loadFixture('http-authed.json'))
  const { files, manifest } = generateWorkflowFromN8n(parsed)

  const graph = files['authedHttp/authedHttp.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // predefined openAiApi → a real graph:httpRequest node with a bearer descriptor
  assert.match(graph, /callOpenAi: "graph:httpRequest"/)
  assert.match(graph, /auth: \{/)
  assert.match(graph, /mode: "bearer"/)
  assert.match(graph, /credential: "my-open-ai"/)

  // generic httpHeaderAuth (header name absent from export) → bearer + a TODO
  assert.match(graph, /callCustom: "graph:httpRequest"/)
  assert.match(graph, /\/\/ TODO\(n8n-import\):/)
  assert.match(graph, /credential: "other-header"/)

  // the auth is resolved at runtime from a secret — NOT a wireAddon credential
  // instance, and no addons file with a bogus @pikku/addon-open-ai package
  const addons = files['authedHttp/authedHttp.addons.gen.ts']
  if (addons)
    assert.doesNotMatch(addons, /addon-open-ai|addon-http-header-auth/)
  assert.equal(
    manifest.find((m) => m.rpcName === 'graph:httpRequest'),
    undefined
  )
})

test('duplicate header / query param names collapse last-wins (no duplicate object keys)', () => {
  const parsed = parseN8n(loadFixture('http-duplicate-params.json'))
  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['httpDupParams/httpDupParams.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // n8n keypair collections allow duplicate names; a JS object literal cannot.
  // Collapse to last-wins (JS object-literal semantics), keeping first position.
  assert.match(
    graph,
    /headers: \{ "Sec-Fetch-Dest": "document", "Accept": "application\/json" \}/
  )
  assert.match(graph, /query: \{ "type": "new" \}/)

  // and the emitted literal must not repeat any key (would be TS1117)
  const headerLine = graph.match(/headers: \{[^}]*\}/)![0]
  assert.equal(
    (headerLine.match(/"Sec-Fetch-Dest":/g) ?? []).length,
    1,
    'Sec-Fetch-Dest appears exactly once'
  )
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

test('pure Code nodes translate to real functions; require() stays a stub', () => {
  const parsed = parseN8n(loadFixture('code-translate.json'))
  const { files } = generateWorkflowFromN8n(parsed)

  // runOnceForAllItems → real function over data.items, no throw
  const all = files['codeTranslate/functions/codeStubDoubler.function.ts']
  assert.ok(all)
  assert.match(all, /Ported from n8n Code node "Doubler"/)
  assert.match(all, /const items = \$items/)
  assert.match(all, /item\.json\.value \* 2/)
  assert.doesNotMatch(all, /implement me/)

  // runOnceForEachItem → per-item map, body returns from the callback
  const each = files['codeTranslate/functions/codeStubPerItem.function.ts']
  assert.ok(each)
  assert.match(each, /\$items\.map\(\(item: any\) => \{/)
  assert.match(each, /const \$json = item\?\.json/)
  assert.match(each, /label: `#\$\{\$json\.doubled\}`/)
  assert.doesNotMatch(each, /implement me/)

  // $env → resolved once from the variables service, read as a plain object
  const env = files['codeTranslate/functions/codeStubWithEnv.function.ts']
  assert.ok(env)
  assert.match(env, /func: async \(\{ variables \}, data\) => \{/)
  assert.match(
    env,
    /const \$env: Record<string, string \| undefined> = await variables\.getAll\(\)/
  )
  assert.match(env, /region: \$env\.AWS_REGION/)
  assert.doesNotMatch(env, /implement me/)

  // require() is not self-contained → throwing stub with verbatim JS preserved
  const stub = files['codeTranslate/functions/codeStubNeedsLodash.function.ts']
  assert.ok(stub)
  assert.match(stub, /Original n8n JavaScript/)
  assert.match(stub, /implement me/)
})

test('translated Code nodes wire their input: predecessor stream + cross-node refs', () => {
  const parsed = parseN8n(loadFixture('code-translate.json'))
  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['codeTranslate/codeTranslate.graph.ts']
  assert.ok(graph)

  // Doubler reads $input.all(); its predecessor is the trigger (webhook)
  assert.match(
    graph,
    /doubler: \{[\s\S]*?input: \(ref\) => \(\{ items: ref\("trigger"\) \}\)/
  )
  // Per Item reads $json; predecessor is Doubler
  assert.match(
    graph,
    /perItem: \{[\s\S]*?input: \(ref\) => \(\{ items: ref\("doubler"\) \}\)/
  )
  // Combine Refs reads $json (predecessor) AND $('Doubler') → two refs
  assert.match(
    graph,
    /combineRefs: \{[\s\S]*?input: \(ref\) => \(\{ items: ref\("withEnv"\), __node_Doubler: ref\("doubler"\) \}\)/
  )

  // the function rebuilds the $node accessor over the wired ref key
  const combine =
    files['codeTranslate/functions/codeStubCombineRefs.function.ts']
  assert.ok(combine)
  assert.match(combine, /const \$node: Record<string, any> = \{/)
  assert.match(
    combine,
    /"Doubler": wrapRef\(toItems\(data\?\.__node_Doubler\)\)/
  )
  assert.match(combine, /const \$ = \(name: string\): any => \$node\[name\]/)
  assert.match(combine, /\$\('Doubler'\)\.all\(\)/)
  assert.doesNotMatch(combine, /implement me/)
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

test('addon-backed agent tools ref the per-service addon rpc directly (no stub)', () => {
  const parsed = parseN8n(loadFixture('agent-addon-tools.json'))
  assert.equal(parsed.shape, 'agent-only')

  const { files } = generateWorkflowFromN8n(parsed)
  const agent = files['opsAssistant/opsAssistant.agent.ts']
  assert.ok(agent, 'agent file emitted')

  // gmailTool / googleCalendarTool resolve to their addon rpc and are refs,
  // not stubs.
  assert.match(agent, /ref\("gmail:messageSend"\)/)
  assert.match(agent, /ref\("google-calendar:eventsInsert"\)/)
  assert.ok(
    !files['opsAssistant/functions/gmailTool__sendEmail.function.ts'],
    'gmailTool no longer leaves a stub'
  )
  assert.ok(
    !files['opsAssistant/functions/googleCalendarTool__addEvent.function.ts'],
    'googleCalendarTool no longer leaves a stub'
  )

  // langchain toolWikipedia / toolCalculator resolve to their dep-free addon
  // rpc and are refs, not stubs — the LLM drives the input via the addon schema.
  assert.match(agent, /ref\("wikipedia:search"\)/)
  assert.match(agent, /ref\("math:evaluate"\)/)
  assert.ok(
    !files['opsAssistant/functions/wikipedia__search.function.ts'],
    'toolWikipedia no longer leaves a stub'
  )
  assert.ok(
    !files['opsAssistant/functions/calculator__evaluate.function.ts'],
    'toolCalculator no longer leaves a stub'
  )

  // a `<service>Tool` variant (baserowTool / openWeatherMapTool) whose base node
  // is mapped resolves to the same base addon rpc — no per-tool map entry needed.
  assert.match(agent, /ref\("baserow:rowGetAll"\)/)
  assert.match(agent, /ref\("open-weather-map:currentWeather"\)/)
  assert.ok(
    !files['opsAssistant/functions/baserow__getAllRows.function.ts'],
    'baserowTool no longer leaves a stub'
  )

  // the addon packages are wired for deployment
  const addons = files['opsAssistant/opsAssistant.addons.gen.ts']
  assert.ok(addons, 'addons file emitted')
  assert.match(addons, /@pikku\/addon-gmail/)
  assert.match(addons, /@pikku\/addon-google-calendar/)
  assert.match(addons, /@pikku\/addon-wikipedia/)
  assert.match(addons, /@pikku\/addon-math/)
  assert.match(addons, /@pikku\/addon-baserow/)
  assert.match(addons, /@pikku\/addon-open-weather-map/)

  // a tool with no addon (mcpClientTool) still refs + emits a stub
  assert.match(agent, /ref\("mcpClientTool__mcp"\)/)
  assert.ok(files['opsAssistant/functions/mcpClientTool__mcp.function.ts'])
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
  // the connected lmChatOpenAi model node → provider-qualified model + temperature
  assert.match(agent, /model: "openai\/gpt-4o"/)
  assert.match(agent, /temperature: 0\.3/)
  // the connected memoryBufferWindow node → memory.lastMessages from contextWindowLength
  assert.match(agent, /memory: \{ lastMessages: 10 \}/)
  // no leftover hardcoded-model TODO once a real model node is resolved
  assert.doesNotMatch(agent, /TODO\(n8n\): map the connected chat-model/)

  // tool stub emitted
  assert.ok(
    files['supportAssistant/functions/httpRequestTool__lookupOrder.function.ts']
  )

  // manifest tool entry marked as agent tool
  assert.equal(manifest.length, 1)
  assert.equal(manifest[0]!.isAgentTool, true)
  assert.equal(manifest[0]!.agentName, 'supportAssistant')
})

test('self-referencing toolWorkflow → lifted sub-graph + agent workflows:[ref], no broken tools ref', () => {
  const parsed = parseN8n(loadFixture('self-workflow-tool.json'))
  const { files } = generateWorkflowFromN8n(parsed)
  const slug = parsed.slug // pageFetcherAssistant
  const subName = `${slug}_fetchPage`

  // the tool body is lifted into its own sub-workflow graph
  const subGraph = files[`${slug}/${subName}.graph.ts`]
  assert.ok(subGraph, 'sub-workflow graph emitted')
  assert.match(subGraph, /pikkuWorkflowGraph\(/)
  assert.match(subGraph, new RegExp(`name: "${subName}"`))
  // the body nodes live in the sub-graph, wired off the executeWorkflowTrigger input
  assert.match(subGraph, /buildConfig: "graph:editFields"/)
  assert.match(subGraph, /fetch: "graph:httpRequest"/)
  assert.match(subGraph, /ref\("trigger", "url"\)/)

  // the agent references the sub-workflow via workflows:[], not a broken tools ref
  const agent = files[`${slug}/${slug}.agent.ts`]
  assert.ok(agent, 'agent emitted')
  assert.match(agent, new RegExp(`workflows: \\[\\s*ref\\("${subName}"\\)`))
  assert.match(agent, /tools: \[\],/)
  // never the old, unrunnable whole-graph self-reference
  assert.doesNotMatch(agent, /ref\("Page Fetcher Assistant"\)/)

  // agent-only after extraction: no main graph, and no throwing tool stub
  assert.ok(!files[`${slug}/${slug}.graph.ts`], 'no main graph (agent-only)')
  assert.ok(
    !Object.keys(files).some((k) => /toolworkflow|fetchpagetool/i.test(k)),
    'no toolWorkflow stub function'
  )

  // the body nodes are NOT duplicated into any other graph
  assert.ok(
    !Object.entries(files).some(
      ([k, v]) =>
        k !== `${slug}/${subName}.graph.ts` &&
        k.endsWith('.graph.ts') &&
        v.includes('graph:httpRequest')
    )
  )
})

test('a reference to a named trigger node lowers to ref("trigger", …), not the trigger nodeId', () => {
  const parsed = parseN8n({
    name: 'Telegram Echo',
    nodes: [
      {
        id: 't',
        name: 'Telegram Trigger',
        type: 'n8n-nodes-base.telegramTrigger',
        parameters: {},
      },
      {
        id: 's',
        name: 'Set',
        type: 'n8n-nodes-base.set',
        parameters: {
          assignments: {
            assignments: [
              {
                name: 'chatId',
                value: '={{ $node["Telegram Trigger"].json.message.chat.id }}',
              },
            ],
          },
        },
      },
    ],
    connections: {
      'Telegram Trigger': {
        main: [[{ node: 'Set', type: 'main', index: 0 }]],
      },
    },
  })

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = Object.values(files).find((f) =>
    f.includes('pikkuWorkflowGraph')
  )
  assert.ok(graph)
  // the trigger is not a graph node → its data is the implicit `trigger` input
  assert.match(graph, /ref\("trigger", "message\.chat\.id"\)/)
  assert.doesNotMatch(graph, /ref\("telegramTrigger"/)
})

test('a reference to a dropped noop node follows the same rewiring as its edges (passthrough)', () => {
  const parsed = parseN8n({
    name: 'Noop Ref Passthrough',
    nodes: [
      {
        id: 't',
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        parameters: {},
      },
      {
        id: 'f',
        name: 'Fetch',
        type: 'n8n-nodes-base.pipedrive',
        parameters: {},
      },
      {
        id: 'p',
        name: 'Passthrough',
        type: 'n8n-nodes-base.noOp',
        parameters: {},
      },
      {
        id: 'b',
        name: 'SetB',
        type: 'n8n-nodes-base.set',
        parameters: {
          assignments: {
            assignments: [
              {
                name: 'status',
                value: '={{ $node["Passthrough"].json.status }}',
              },
            ],
          },
        },
      },
      {
        id: 'c',
        name: 'ChatInput',
        type: 'n8n-nodes-base.noOp',
        parameters: {},
      },
      {
        id: 'd',
        name: 'SetC',
        type: 'n8n-nodes-base.set',
        parameters: {
          assignments: {
            assignments: [
              { name: 'text', value: '={{ $node["ChatInput"].json.text }}' },
            ],
          },
        },
      },
    ],
    connections: {
      'Manual Trigger': { main: [[{ node: 'Fetch', type: 'main', index: 0 }]] },
      Fetch: { main: [[{ node: 'Passthrough', type: 'main', index: 0 }]] },
      Passthrough: { main: [[{ node: 'SetB', type: 'main', index: 0 }]] },
      ChatInput: { main: [[{ node: 'SetC', type: 'main', index: 0 }]] },
    },
  })

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = Object.values(files).find((f) =>
    f.includes('pikkuWorkflowGraph')
  )!
  assert.ok(graph)
  // a mid-flow noop is a passthrough — a ref to it resolves to its graph-node
  // data source (Fetch), exactly as the dropped edge rewires SetB's predecessor.
  assert.match(graph, /ref\("fetch", "status"\)/)
  // an entry noop stands in for the implicit input — a ref to it lowers to trigger.
  assert.match(graph, /ref\("trigger", "text"\)/)
  // never a dangling ref at the removed noop nodeIds
  assert.doesNotMatch(graph, /ref\("passthrough"/)
  assert.doesNotMatch(graph, /ref\("chatInput"/)
})

test('workflow name is sanitized to a JS-string-safe value (apostrophes stripped)', () => {
  const parsed = parseN8n({
    name: 'd\'Auto-Post 💥 aux "réseaux"',
    nodes: [
      {
        id: 'n1',
        name: 'No Op',
        type: 'n8n-nodes-base.noOp',
        parameters: {},
      },
    ],
    connections: {},
  })
  // apostrophe / double-quote / backtick / backslash stripped; unicode kept
  assert.doesNotMatch(parsed.name, /['"`\\]/)
  assert.match(parsed.name, /dAuto-Post 💥 aux réseaux/)

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = Object.values(files).find((f) =>
    f.includes('pikkuWorkflowGraph')
  )
  assert.ok(graph)
  // the emitted name is a valid single- and double-quoted string (no stray quote)
  assert.doesNotMatch(graph, /name: "[^"]*'[^"]*"/)
})

test('rpcPrefix namespaces stub rpcs (tool refs + stub files) but not workflow/agent names', () => {
  const parsed = parseN8n(loadFixture('agent-with-tool.json'))
  const { files } = generateWorkflowFromN8n(parsed, { rpcPrefix: 'w0007_' })

  const agent = files['supportAssistant/supportAssistant.agent.ts']
  assert.ok(agent)
  // the agent const name (a workflow/agent name) is NOT prefixed
  assert.match(agent, /export const supportAssistantAgent = pikkuAIAgent/)
  // the tool ref + its stub file ARE prefixed
  assert.match(agent, /ref\("w0007_httpRequestTool__lookupOrder"\)/)
  assert.ok(
    files[
      'supportAssistant/functions/w0007_httpRequestTool__lookupOrder.function.ts'
    ]
  )
})

test('agent with structured output parser → agent output Zod schema + resolved model', () => {
  const parsed = parseN8n(
    JSON.parse(
      readFileSync(
        join(fixturesDir, '../fixtures-ai/agent-structured-output.json'),
        'utf-8'
      )
    )
  )
  assert.equal(parsed.shape, 'agent-only')

  const { files } = generateWorkflowFromN8n(parsed)
  const agent = files['leadExtractor/leadExtractor.agent.ts']
  assert.ok(agent, 'agent file emitted')

  // Gemini model node: modelName `models/gemini-1.5-flash` → google/gemini-1.5-flash
  assert.match(agent, /model: "google\/gemini-1\.5-flash"/)
  assert.match(agent, /temperature: 0\.2/)

  // outputParserStructured (manual inputSchema) → agent `output` schema.
  assert.match(agent, /import \{ z \} from 'zod'/)
  // inline schemas are rejected (PKU489): emit an exported const + reference it
  assert.match(agent, /export const LeadExtractorOutput = z\.object\(/)
  assert.match(agent, /output: LeadExtractorOutput,/)
  assert.doesNotMatch(agent, /output: z\.object\(/)
  // draft-07 `type: ["string","null"]` normalized to `.nullable()`
  assert.match(agent, /domain: z\.string\(\)\.nullable\(\)/)
  assert.match(agent, /cheapest_plan: z\.number\(\)\.nullable\(\)/)
  // `required: ["has_api"]` → not optional; unlisted keys optional
  assert.match(agent, /has_api: z\.boolean\(\)/)
  assert.match(agent, /domain: z\.string\(\)\.nullable\(\)\.optional\(\)/)
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
    /sortBy: \[\{ field: "created", order: "desc" as const \}, \{ field: "name", order: "asc" as const \}\]/
  )

  // renameKeys: currentKey/newKey rows → oldKey/newKey mappings
  assert.match(graph, /mappings: \[\{ oldKey: "old", newKey: "new" \}\]/)

  // aggregate: rows → the `fields` array (single row here), output name carried
  assert.match(graph, /fields: \[\{ field: "id", outputField: "ids" \}\]/)

  // summarize: aggregation enum remapped (average → avg)
  assert.match(
    graph,
    /aggregations: \[\{ field: "amount", operation: "avg" as const, outputField: "amount" \}\]/
  )

  // none of the four leaves a throwing stub function behind
  assert.ok(!files['collectionTransforms/functions/sort__sortIt.function.ts'])
  assert.ok(
    !files['collectionTransforms/functions/aggregate__roll.function.ts']
  )
})

test('a ref into a dateTime node’s named output field (formattedDate) resolves to the addon key (result)', () => {
  const parsed = parseN8n({
    name: 'DateTime Output Alias',
    nodes: [
      {
        id: 't',
        name: 'Manual',
        type: 'n8n-nodes-base.manualTrigger',
        parameters: {},
      },
      {
        id: 'd',
        name: 'Format Date',
        type: 'n8n-nodes-base.dateTime',
        parameters: {
          operation: 'formatDate',
          date: '={{ $json.when }}',
          format: 'yyyy-MM-dd',
        },
      },
      {
        id: 'e',
        name: 'Custom Out',
        type: 'n8n-nodes-base.dateTime',
        parameters: {
          operation: 'formatDate',
          options: { outputFieldName: 'myDate' },
        },
      },
      {
        id: 's',
        name: 'Set',
        type: 'n8n-nodes-base.set',
        parameters: {
          assignments: {
            assignments: [
              {
                name: 'a',
                value: '={{ $node["Format Date"].json.formattedDate }}',
              },
              { name: 'b', value: '={{ $node["Custom Out"].json.myDate }}' },
            ],
          },
        },
      },
    ],
    connections: {
      Manual: { main: [[{ node: 'Format Date', type: 'main', index: 0 }]] },
      'Format Date': {
        main: [[{ node: 'Custom Out', type: 'main', index: 0 }]],
      },
      'Custom Out': { main: [[{ node: 'Set', type: 'main', index: 0 }]] },
    },
  })

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = Object.values(files).find((f) =>
    f.includes('pikkuWorkflowGraph')
  )!
  assert.ok(graph)
  // default output-field name `formattedDate` → the addon key `result`
  assert.match(graph, /ref\("formatDate", "result"\)/)
  // a custom `options.outputFieldName` is honored too
  assert.match(graph, /ref\("customOut", "result"\)/)
  // no dangling n8n field name survives
  assert.doesNotMatch(graph, /"formattedDate"/)
  assert.doesNotMatch(graph, /ref\("customOut", "myDate"\)/)
})

test('dateTime v1 + v2 and crypto v1 normalize onto the single graph fn; sign stays a stub', () => {
  const parsed = parseN8n(loadFixture('datetime-crypto-versions.json'))
  assert.equal(parsed.shape, 'pure-graph')

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['datetimeCryptoVersions/datetimeCryptoVersions.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // both dateTime versions collapse onto graph:dateTime — no versioned addon fn
  assert.match(graph, /addDays: "graph:dateTime"/)
  assert.match(graph, /formatV1: "graph:dateTime"/)
  // v2 addToDate → add, value sourced from `magnitude`, amount/unit mapped
  assert.match(graph, /operation: "add" as const/)
  assert.match(graph, /value: ref\("trigger", "ts"\)/)
  assert.match(graph, /amount: 365/)
  assert.match(graph, /unit: "days" as const/)
  // v1 action:format → format, format string from `toFormat`
  assert.match(graph, /operation: "format" as const/)
  assert.match(graph, /format: "YYYY-MM-DD"/)

  // v2 extractDate → extract, `part` carried through onto the single graph fn
  assert.match(graph, /extractYear: "graph:dateTime"/)
  assert.match(graph, /operation: "extract" as const/)
  assert.match(graph, /part: "year" as const/)

  // crypto v1 hash → graph:crypto with algorithm lowercased (SHA256 → sha256)
  assert.match(graph, /hash: "graph:crypto"/)
  assert.match(graph, /operation: "hash" as const/)
  assert.match(graph, /algorithm: "sha256" as const/)
  assert.match(graph, /encoding: "hex" as const/)

  // RSA sign has no addon equivalent → stays a stub, not a wrong mapping
  assert.match(graph, /signIt: "crypto__signIt"/)
  assert.ok(
    files['datetimeCryptoVersions/functions/crypto__signIt.function.ts']
  )
})

test('html/xml/markdown nodes map to the external text addons (not graph builtins)', () => {
  const parsed = parseN8n(loadFixture('text-file-addons.json'))
  assert.equal(parsed.shape, 'pure-graph')

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['textFileAddons/textFileAddons.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // html extractHtmlContent → @pikku/addon-html-extract, HTML sourced from the
  // predecessor at the node's dataPropertyName, selectors from the fixedCollection
  assert.match(graph, /extract: "html-extract:htmlExtract"/)
  assert.match(graph, /html: ref\("trigger", "page"\)/)
  assert.match(graph, /extractions: \[/)
  assert.match(graph, /key: "titles"/)
  assert.match(graph, /cssSelector: "h2 a"/)
  assert.match(graph, /returnValue: "text"/)
  assert.match(graph, /attribute: "href"/)

  // convertToHtmlTable → @pikku/addon-html, whole predecessor stream as `data`
  assert.match(graph, /toTable: "html:htmlToTable"/)

  // the template (default) operation has no addon equivalent → stays a stub
  assert.match(graph, /template: "html__template"/)
  assert.ok(files['textFileAddons/functions/html__template.function.ts'])

  // xml both directions → @pikku/addon-xml, string sourced from dataPropertyName
  assert.match(graph, /xmlToJson: "xml:xmlToJson"/)
  assert.match(graph, /xml: ref\("template", "body"\)/)
  assert.match(graph, /jsonToXml: "xml:jsonToXml"/)

  // markdown both directions → @pikku/addon-markdown (direct expression params)
  assert.match(graph, /htmlToMd: "markdown:htmlToMarkdown"/)
  assert.match(graph, /mdToHtml: "markdown:markdownToHtml"/)
})

test('filesystem nodes → graph:readFile / graph:writeFile (content service)', () => {
  const parsed = parseN8n(loadFixture('file-content-service.json'))
  assert.equal(parsed.shape, 'pure-graph')

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['fileContentService/fileContentService.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // readWriteFile read/write branch onto the two builtins by operation
  assert.match(graph, /read: "graph:readFile"/)
  assert.match(graph, /write: "graph:writeFile"/)
  // path → asset key; n8n reads raw binary → base64 carried through
  assert.match(graph, /key: "reports\/input\.csv"/)
  assert.match(graph, /key: "reports\/output\.csv"/)
  assert.match(graph, /encoding: "base64" as const/)
  // write pulls the bytes from the predecessor's data property
  assert.match(graph, /data: ref\("read", "data"\)/)

  // legacy binary read/write nodes map to the same builtins
  assert.match(graph, /readBin: "graph:readFile"/)
  assert.match(graph, /key: "assets\/logo\.png"/)
  assert.match(graph, /writeBin: "graph:writeFile"/)
  assert.match(graph, /key: "assets\/copy\.png"/)
})

test('extractFromFile / convertToFile multiplex to the right parse addon by file type', () => {
  const parsed = parseN8n(loadFixture('file-multiplexers.json'))
  assert.equal(parsed.shape, 'pure-graph')

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['fileMultiplexers/fileMultiplexers.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // pdf → read-pdf (inline base64 from the item's binaryPropertyName)
  assert.match(graph, /parsePdf: "read-pdf:readPdf"/)
  assert.match(graph, /base64: ref\("load", "data"\)/)
  // xlsx → spreadsheet parser
  assert.match(graph, /parseSheet: "spreadsheet:xlsxToJson"/)
  // text → the dep-free binary addon (base64 from the item's binaryPropertyName)
  assert.match(graph, /parseText: "binary:extractText"/)
  assert.ok(
    !files['fileMultiplexers/functions/extractFromFile__parseText.function.ts'],
    'text extract no longer leaves a stub'
  )

  // convertToFile xlsx → spreadsheet writer; toText → binary:toTextFile
  assert.match(graph, /makeSheet: "spreadsheet:jsonToXlsx"/)
  assert.match(graph, /makeText: "binary:toTextFile"/)
  assert.match(graph, /text: ref\("makeSheet", "body"\)/)
  assert.ok(
    !files['fileMultiplexers/functions/convertToFile__makeText.function.ts'],
    'toText convert no longer leaves a stub'
  )

  // moveBinaryData → binary:moveBinaryData with the mode pinned as a const
  assert.match(graph, /moveData: "binary:moveBinaryData"/)
  assert.match(graph, /mode: "binaryToJson"/)
  assert.match(graph, /base64: ref\("makeText", "data"\)/)

  // convertToFile toBinary (JSON item → binary property) → binary:moveBinaryData
  // in jsonToBinary mode, fed the whole predecessor item — no stub.
  assert.match(graph, /makeBinary: "binary:moveBinaryData"/)
  assert.match(graph, /mode: "jsonToBinary"/)
  assert.ok(
    !files['fileMultiplexers/functions/convertToFile__makeBinary.function.ts'],
    'toBinary convert no longer leaves a stub'
  )
})

test('cron/interval are triggers; terminal respondToWebhook is dropped', () => {
  const parsed = parseN8n(loadFixture('cron-respond-terminal.json'))
  assert.equal(parsed.shape, 'pure-graph')

  // cron is a schedule trigger (separate wiring), not a graph node
  const schedule = parsed.nodes.find((n) => n.name === 'Schedule')
  assert.equal(schedule?.role, 'trigger')
  // terminal respondToWebhook collapses like a noop (response = graph output)
  const respond = parsed.nodes.find((n) => n.name === 'Respond')
  assert.equal(respond?.role, 'noop')

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['cronRespondTerminal/cronRespondTerminal.graph.ts']
  assert.ok(graph, 'graph file emitted')
  assert.match(graph, /shape: "graph:editFields"/)
  assert.doesNotMatch(graph, /schedule:/)
  assert.doesNotMatch(graph, /respond:/)
})

test('mid-flow respondToWebhook fails the import loudly', () => {
  assert.throws(
    () => parseN8n(loadFixture('respond-midflow.json')),
    /responds mid-workflow/
  )
})

test('Merge combine → graph:merge; append → graph:concat, both fed by all predecessors', () => {
  const parsed = parseN8n(loadFixture('merge-modes.json'))
  assert.equal(parsed.shape, 'pure-graph')

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['mergeModes/mergeModes.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // combine mode → graph:merge (object merge), items sourced from BOTH branches
  assert.match(graph, /combine: "graph:merge"/)
  assert.match(graph, /items: \[ref\("a"\), ref\("b"\)\]/)

  // append mode concatenates the input streams → graph:concat over all inputs
  assert.match(graph, /appended: "graph:concat"/)
  assert.match(graph, /inputs: \[ref\("combine"\)\]/)
  assert.ok(
    !files['mergeModes/functions/merge__appended.function.ts'],
    'append no longer leaves a stub'
  )
})

test('Merge with no mode defaults to append → graph:concat (append is the zero-config default)', () => {
  const parsed = parseN8n(loadFixture('merge-default.json'))
  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files[Object.keys(files).find((k) => k.endsWith('.graph.ts'))!]
  assert.ok(graph, 'graph file emitted')
  assert.match(graph, /joined: "graph:concat"/)
  assert.match(graph, /inputs: \[ref\("a"\), ref\("b"\)\]/)
  assert.equal(
    Object.keys(files).filter((f) => /\/functions\//.test(f)).length,
    0,
    'no stub functions for a bare-append merge of two Set nodes'
  )
})

test('itemLists ops delegate to the standalone graph array transforms', () => {
  const parsed = parseN8n(loadFixture('itemlists-modes.json'))
  assert.equal(parsed.shape, 'pure-graph')

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['itemListsModes/itemListsModes.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // each Item Lists operation reuses the standalone node's spec + field mapping
  assert.match(graph, /splitOut: "graph:splitOut"/)
  assert.match(graph, /field: "tags"/)
  assert.match(graph, /dedupe: "graph:removeDuplicates"/)
  assert.match(graph, /sort: "graph:sort"/)
  assert.match(graph, /field: "name"/)
  assert.match(graph, /order: "desc"/)
  assert.match(graph, /limit: "graph:limit"/)
  assert.match(graph, /limit: 5/)

  // concatenateItems has no standalone equivalent → honest stub
  assert.match(graph, /concat: "itemLists__concat"/)
  assert.ok(files['itemListsModes/functions/itemLists__concat.function.ts'])
})

test('aggregate: multiple rows → graph:aggregate fields[]; aggregateAllItemData → whole-item mode', () => {
  const parsed = parseN8n(loadFixture('aggregate-multifield.json'))
  assert.equal(parsed.shape, 'pure-graph')

  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['aggregateMultiField/aggregateMultiField.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // two rows → the fields array; the row without outputFieldName omits it
  // (the addon defaults the output name to the source field path)
  assert.match(graph, /roll: "graph:aggregate"/)
  assert.match(
    graph,
    /fields: \[\{ field: "text" \}, \{ field: "repost\.text", outputField: "repost" \}\]/
  )

  // aggregateAllItemData (collect whole items) → graph:aggregate whole-item mode
  assert.match(graph, /allData: "graph:aggregate"/)
  assert.match(graph, /includeAllItems: true/)
  assert.match(graph, /outputField: "data"/)
  assert.ok(
    !files['aggregateMultiField/functions/aggregate__allData.function.ts'],
    'aggregateAllItemData no longer leaves a stub'
  )
})

test('executeWorkflow: self-recursion + static-in-set resolve to workflow.do targets', () => {
  const parsed = parseN8n(loadFixture('subworkflow-refs.json'))
  const { files, diagnostics } = generateWorkflowFromN8n(parsed, {
    resolveWorkflowRef: (id) =>
      id === 'TARGET123' ? 'Enrich Lead' : undefined,
  })
  assert.equal(diagnostics.length, 0)

  const graph = files[Object.keys(files).find((k) => k.endsWith('.graph.ts'))!]
  assert.ok(graph, 'graph file emitted')
  const nodesBlock = graph.match(/nodes:\s*\{([\s\S]*?)\n {2}\},/)![1]!

  // self-ref ($workflow.id) → the workflow's OWN registered name (recursion)
  assert.match(nodesBlock, /callSelf: "Recursive Importer"/)
  // static id → the name the import-set resolver returned
  assert.match(nodesBlock, /callOther: "Enrich Lead"/)

  // neither sub-workflow node leaves a throwing stub behind
  assert.equal(
    Object.keys(files).filter((f) => /\/functions\//.test(f)).length,
    0
  )
})

test('executeWorkflow: a missing target skips the workflow with a diagnostic (no stub)', () => {
  const parsed = parseN8n(loadFixture('subworkflow-refs.json'))
  const { files, diagnostics } = generateWorkflowFromN8n(parsed, {
    resolveWorkflowRef: () => undefined,
  })
  assert.equal(
    Object.keys(files).length,
    0,
    'nothing emitted — workflow skipped'
  )
  assert.ok(
    diagnostics.some(
      (d) =>
        d.diagnostic === 'PIKKU_N8N_IMPORT_DIAGNOSTIC' &&
        d.type === 'error' &&
        d.reason === 'missing-subworkflow' &&
        d.node === 'CallOther'
    ),
    'missing-subworkflow diagnostic present'
  )
})

test('executeWorkflow: a runtime-dynamic target skips the workflow with a diagnostic', () => {
  const parsed = parseN8n(loadFixture('subworkflow-dynamic.json'))
  const { files, diagnostics } = generateWorkflowFromN8n(parsed)
  assert.equal(Object.keys(files).length, 0)
  assert.ok(
    diagnostics.some(
      (d) =>
        d.diagnostic === 'PIKKU_N8N_IMPORT_DIAGNOSTIC' &&
        d.type === 'error' &&
        d.reason === 'dynamic-subworkflow-target'
    )
  )
})

test('collection source → single per-item consumer lowers to a graph:fanout node', () => {
  const parsed = parseN8n(loadFixture('sheets-read-fanout.json'))
  const { files } = generateWorkflowFromN8n(parsed)

  const graph = files['sheetReadFanout/sheetReadFanout.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // the read node is repointed to the ergonomic array-returning fn
  assert.match(graph, /read: "google-sheets:readRows"/)
  // a synthetic fanout node registers graph:fanout; the consumer is absorbed
  assert.match(graph, /postMap: "graph:fanout"/)
  assert.doesNotMatch(graph, /\bpost: "graph:httpRequest"/)
  // the source now flows into the map node, not directly into the consumer
  assert.match(graph, /read: \{[\s\S]*next: "postMap"/)
  // the map node fans out over the source array and invokes the consumer rpc
  assert.match(graph, /items: ref\("read"\)/)
  assert.match(graph, /child: "graph:httpRequest"/)
  assert.match(graph, /stepPrefix: "postMap"/)
  // the consumer's per-item refs are rebound from the source to $item
  assert.match(graph, /"video": ref\("\$item", "url"\)/)
  assert.match(graph, /"caption": ref\("\$item", "title"\)/)
  // no residual ref against the whole array output
  assert.doesNotMatch(graph, /ref\("read", "url"\)/)
})

test('a lone chainLlm node maps to a tools-less pikkuAIAgent (goal from prompt, model from sub-node)', () => {
  const parsed = parseN8n(loadFixture('ai-chain-llm.json'))
  const { files } = generateWorkflowFromN8n(parsed)

  const agent = files['themeExtractor/themeExtractor.agent.ts']
  assert.ok(agent, 'agent file emitted')

  assert.match(agent, /pikkuAIAgent\(\{/)
  // goal carries the chain's prompt text
  assert.match(agent, /goal: "Extract a list of themes from this/)
  // model mapped from the connected lmChatOpenAi sub-node
  assert.match(agent, /model: "openai\/gpt-4o-mini"/)
  // tools-less
  assert.match(agent, /tools: \[\]/)

  // the chain is NOT emitted as a throwing integration stub
  assert.ok(
    !Object.keys(files).some(
      (k) => k.includes('/functions/') && /chainLlm|basicLlmChain/i.test(k)
    ),
    'no chain stub function'
  )
})

test('a lone informationExtractor maps to a structured-output agent (schema from inputSchema)', () => {
  const parsed = parseN8n(loadFixture('ai-chain-extractor.json'))
  const { files } = generateWorkflowFromN8n(parsed)
  const agent = files['infoExtractor/infoExtractor.agent.ts']
  assert.ok(agent, 'agent file emitted')

  // goal from the extractor's systemPromptTemplate, not its input `text`
  assert.match(agent, /goal: "Pull out the person's name and age\."/)
  // structured output built from the node's own inputSchema
  assert.match(agent, /import \{ z \} from 'zod'/)
  assert.match(agent, /export const InfoExtractorOutput = z\.object/)
  assert.match(agent, /name: z\.string\(\)/)
  assert.match(agent, /age: z\.number\(\)/)
  assert.match(agent, /output: InfoExtractorOutput,/)
})

test('a lone textClassifier maps to an agent whose output is a category enum', () => {
  const parsed = parseN8n(loadFixture('ai-chain-classifier.json'))
  const { files } = generateWorkflowFromN8n(parsed)
  const agent = files['emailClassifier/emailClassifier.agent.ts']
  assert.ok(agent, 'agent file emitted')

  assert.match(agent, /category: z\.enum\(\["is_appointment", "is_spam"\]\)/)
  assert.match(agent, /output: EmailClassifierOutput,/)
  assert.match(agent, /tools: \[\]/)
})

test('multi-chain pipeline → graph wiring N distinct tools-less agents (one .agent.ts each)', () => {
  const parsed = parseN8n(loadFixture('ai-multi-chain.json'))
  assert.equal(parsed.shape, 'graph-with-agent')
  const { files } = generateWorkflowFromN8n(parsed)

  // one graph + one agent file per chain, namespaced by node id
  const graph = files['twoStepChain/twoStepChain.graph.ts']
  assert.ok(graph, 'graph emitted')
  const draft = files['twoStepChain/twoStepChain_draft.agent.ts']
  const polish = files['twoStepChain/twoStepChain_polish.agent.ts']
  assert.ok(draft && polish, 'one agent file per chain')

  // graph references each agent by its own const, wired in sequence
  assert.match(graph, /draft: "twoStepChain_draftAgent"/)
  assert.match(graph, /polish: "twoStepChain_polishAgent"/)
  assert.match(graph, /draft: \{[^}]*next: "polish"/s)

  // each agent has its own name, prompt, and model (no collision)
  assert.match(draft, /export const twoStepChain_draftAgent = pikkuAIAgent/)
  assert.match(draft, /name: "twoStepChain_draft"/)
  assert.match(draft, /goal: "Draft a reply to: \{\{ \$json\.msg \}\}"/)
  assert.match(draft, /model: "openai\/gpt-4o-mini"/)
  assert.match(polish, /export const twoStepChain_polishAgent = pikkuAIAgent/)
  assert.match(polish, /model: "anthropic\/claude-3-5-sonnet"/)

  // no throwing chain stub
  assert.ok(
    !Object.keys(files).some(
      (k) => k.includes('/functions/') && /chainLlm/i.test(k)
    )
  )
})

test('chain + real Agent → two agents; tools attributed to the Agent, none to the chain (v2.1)', () => {
  const parsed = parseN8n(loadFixture('ai-chain-plus-agent.json'))
  assert.equal(parsed.shape, 'graph-with-agent')
  const { files } = generateWorkflowFromN8n(parsed)

  const graph = files['triageAndReply/triageAndReply.graph.ts']
  const summarize = files['triageAndReply/triageAndReply_summarize.agent.ts']
  const replyAgent = files['triageAndReply/triageAndReply_replyAgent.agent.ts']
  assert.ok(graph && summarize && replyAgent, 'graph + both agent files')

  // graph wires the chain into the real agent
  assert.match(graph, /summarize: "triageAndReply_summarizeAgent"/)
  assert.match(graph, /replyAgent: "triageAndReply_replyAgentAgent"/)
  assert.match(graph, /summarize: \{[^}]*next: "replyAgent"/s)

  // the chain is tools-less
  assert.match(summarize, /tools: \[\]/)
  // the real Agent keeps its own tool, not cross-wired to the chain
  assert.match(replyAgent, /tools: \[\s*ref\("toolHttpRequest__search"\)/)
})

test('openAi chat node → agent-only pikkuAIAgent with inline model + goal', () => {
  const parsed = parseN8n(loadFixture('openai-chat-agent.json'))
  assert.equal(parsed.shape, 'agent-only')

  const { files } = generateWorkflowFromN8n(parsed)
  const agent = files['summarizer/summarizer.agent.ts']
  assert.ok(agent, 'agent file emitted')
  assert.match(agent, /pikkuAIAgent\(/)
  // inline model read from the node's own `model` param (not a sub-node)
  assert.match(agent, /model: "openai\/gpt-4o"/)
  assert.match(agent, /temperature: 0\.8/)
  // goal built from the chat messages
  assert.match(agent, /goal: "You are a concise assistant/)
  // no leftover TODO for a missing chat-model sub-node
  assert.doesNotMatch(agent, /TODO\(n8n\): map the connected chat-model/)
  // openAi text/chat must NOT emit an @pikku/addon-openai wireAddon
  assert.doesNotMatch(agent, /addon-openai/)
})

test('toolHttpRequest agent tool → a real http function (not a stub)', () => {
  const parsed = parseN8n(loadFixture('tool-http-request.json'))
  assert.equal(parsed.shape, 'agent-only')

  const { files } = generateWorkflowFromN8n(parsed)
  const toolFile =
    files['tokenBot/functions/toolHttpRequest__fetchTokens.function.ts']
  assert.ok(toolFile, 'tool function file emitted')
  // real function: performs the fetch, carries the tool description, no stub marker
  assert.doesNotMatch(toolFile, /implement me/)
  assert.match(toolFile, /await fetch\(/)
  assert.match(
    toolFile,
    /https:\/\/api\.dexscreener\.com\/token-profiles\/latest\/v1/
  )
  assert.match(toolFile, /Fetch the latest token profiles from DexScreener\./)
  // the agent still references it as a tool
  const agent = files['tokenBot/tokenBot.agent.ts']
  assert.match(agent, /ref\("toolHttpRequest__fetchTokens"\)/)
})

test('toolWorkflow: a static cross-workflow ref resolves to agent workflows:[ref], no stub', () => {
  const parsed = parseN8n(loadFixture('tool-workflow-cross-ref.json'))
  const { files, diagnostics } = generateWorkflowFromN8n(parsed, {
    resolveWorkflowRef: (id) =>
      id === 'TARGET123' ? 'Enrich Lead' : undefined,
  })
  assert.equal(diagnostics.length, 0)

  const agent = files['routerBot/routerBot.agent.ts']
  assert.ok(agent, 'agent file emitted')
  // the cross-workflow tool is wired as an agent workflow capability
  assert.match(agent, /workflows: \[\s*ref\("Enrich Lead"\),?\s*\]/)
  // it is NOT a broken rpc tool ref and leaves no throwing stub behind
  assert.doesNotMatch(agent, /tools: \[\s*ref\("toolWorkflow/)
  assert.equal(
    Object.keys(files).filter((f) => /\/functions\//.test(f)).length,
    0,
    'no stub function emitted for the workflow-backed tool'
  )
})

test('toolWorkflow: a cross-workflow ref with no resolver skips the workflow (external)', () => {
  const parsed = parseN8n(loadFixture('tool-workflow-cross-ref.json'))
  const { files, diagnostics } = generateWorkflowFromN8n(parsed, {
    resolveWorkflowRef: () => undefined,
  })
  assert.equal(Object.keys(files).length, 0, 'no files — skipped')
  assert.ok(
    diagnostics.some(
      (d) => d.type === 'error' && d.reason === 'missing-subworkflow'
    ),
    'missing-subworkflow diagnostic'
  )
})

test('cross-node ref: $(name).first().json.<path> lowers to ref(), not a dropped TODO', () => {
  const parsed = parseN8n(loadFixture('cross-node-ref.json'))
  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['crossNodeRef/crossNodeRef.graph.ts']
  assert.ok(graph, 'graph file emitted')
  // Build's `endpoint` reads Config.first().json.apiBase — a non-adjacent node —
  // and must resolve to a declarative cross-node ref, not vanish to a comment.
  assert.match(
    graph,
    /field: "endpoint", operation: "set" as const, value: ref\("config", "apiBase"\)/
  )
  // the same ref inside surrounding text lowers to a template
  assert.match(
    graph,
    /field: "greeting"[^\n]*template\("at \$0!", \[ref\("config", "apiBase"\)\]\)/
  )
  // nothing dropped
  assert.doesNotMatch(graph, /TODO\(n8n expr\)/)
})

test('computed Set node (transform field) → generated function, not editFields', () => {
  const parsed = parseN8n(loadFixture('computed-set.json'))
  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['computedSet/computedSet.graph.ts']
  assert.ok(graph, 'graph emitted')

  // Build has a `$json.a * 1.2` transform → it is functionized, not editFields.
  assert.doesNotMatch(graph, /build: "graph:editFields"/)
  assert.match(graph, /build: "codeStubBuild"/)
  // Use is pure-ref/static → it stays a declarative editFields node.
  assert.match(graph, /use: "graph:editFields"/)
  // the downstream ref into Build still resolves by node id + field
  assert.match(graph, /ref\("build", "total"\)/)

  // Build's function file computes the object with the raw expression, no drop.
  const fn = files['computedSet/functions/codeStubBuild.function.ts']
  assert.ok(fn, 'Build function emitted')
  assert.match(fn, /Ported from n8n Set node "Build"/)
  assert.match(fn, /"total": \$json\.a \* 1\.2/)
  assert.match(fn, /"endpoint": "https:\/\/api\.example\.com"/)
  assert.doesNotMatch(fn, /data as any/)

  // nothing dropped anywhere
  assert.doesNotMatch(graph, /TODO\(n8n expr\)/)
})

test('executeCommand → execution:execute addon call, wireAddon @pikku/addon-execution', () => {
  const parsed = parseN8n(loadFixture('execute-command.json'))
  const { files } = generateWorkflowFromN8n(parsed)
  const graph = files['executeCommand/executeCommand.graph.ts']
  assert.ok(graph, 'graph emitted')
  // the executeCommand node maps to the addon rpc directly — no stub
  assert.match(graph, /run: "execution:execute"/)
  assert.match(graph, /command: "ls -la \/tmp"/)
  assert.ok(
    !files['executeCommand/functions/executeCommand__run.function.ts'],
    'no stub for executeCommand'
  )
  // the addon package is wired
  const addons = files['executeCommand/executeCommand.addons.gen.ts']
  assert.ok(addons, 'addons file emitted')
  assert.match(addons, /@pikku\/addon-execution/)
})

test('a retrieve-as-tool vector store becomes an addon-backed agent tool', () => {
  const parsed = parseN8n(loadFixture('rag-tool-vectorstore.json'))
  const { files } = generateWorkflowFromN8n(parsed)

  // the store node refs the addon's query rpc directly — no throwing #902 stub
  const agent = files['ragToolVectorStore/ragToolVectorStore.agent.ts']
  assert.ok(agent, 'agent file emitted')
  assert.match(agent, /ref\("qdrant:query"\)/)
  assert.ok(
    !files[
      'ragToolVectorStore/functions/vectorStub__qdrantVectorStore.function.ts'
    ],
    'no vector stub emitted for a retrieve-as-tool store'
  )

  // the qdrant addon is wired
  const addons = files['ragToolVectorStore/ragToolVectorStore.addons.gen.ts']
  assert.ok(addons, 'addons file emitted')
  assert.match(addons, /@pikku\/addon-qdrant/)
  // <store>:query embeds via openai:textEmbedding at runtime, so the openai
  // addon must be wired alongside the vector store
  assert.match(addons, /@pikku\/addon-openai/)
})

test('chainRetrievalQa becomes a deterministic retrieve-then-answer pipeline', () => {
  const parsed = parseN8n(loadFixture('rag-chain-retrievalqa.json'))
  const { files } = generateWorkflowFromN8n(parsed)

  // the store is a main-flow retrieval step feeding the promoted agent
  const graph = files['retrievalQaChain/retrievalQaChain.graph.ts']
  assert.ok(graph, 'graph file emitted')
  assert.match(graph, /qdrantVectorStore: "qdrant:query"/)
  assert.match(graph, /collection: "handbook"/)
  assert.match(graph, /query: ref\("trigger", "body\.question"\)/)
  // retrieval flows INTO the agent
  assert.match(graph, /qdrantVectorStore: \{[\s\S]*next: "qaChain"/)
  // no throwing #902 vector stub for the retrieve store
  assert.ok(
    !files[
      'retrievalQaChain/functions/vectorStub__qdrantVectorStore.function.ts'
    ]
  )

  // the chain is a tools-less agent with a retrieval-QA goal
  const agent = files['retrievalQaChain/retrievalQaChain.agent.ts']
  assert.ok(agent, 'agent file emitted')
  assert.match(agent, /retrieved context/)
  assert.match(agent, /tools: \[\]/)

  // qdrant addon wired, plus openai for the embedding step
  const addons = files['retrievalQaChain/retrievalQaChain.addons.gen.ts']
  assert.match(addons, /@pikku\/addon-qdrant/)
  assert.match(addons, /@pikku\/addon-openai/)
})

test('vectorStore insert becomes a split → ingest pipeline', () => {
  const parsed = parseN8n(loadFixture('rag-ingestion-qdrant.json'))
  const { files } = generateWorkflowFromN8n(parsed)

  const graph = files['ingestHandbook/ingestHandbook.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // the store node becomes the fat `<ns>:ingest` (embeds chunks + upserts)
  assert.match(graph, /qdrantVectorStore: "qdrant:ingest"/)

  // a graph:splitText node is synthesized ahead of the ingest
  assert.match(graph, /"graph:splitText"/)

  // the splitter reads the main predecessor's payload, strategy + chunk sizes
  // come from the n8n text-splitter sub-node
  assert.match(graph, /text: ref\("trigger"\)/)
  assert.match(graph, /strategy: "recursive"/)
  assert.match(graph, /chunkSize: 800/)
  assert.match(graph, /chunkOverlap: 80/)

  // main flow: trigger → splitText → ingest
  const splitId = graph.match(/(\w+): "graph:splitText"/)?.[1]
  assert.ok(splitId, 'split node id')
  assert.match(
    graph,
    new RegExp(`${splitId}: \\{[\\s\\S]*next: "qdrantVectorStore"`)
  )

  // ingest consumes the split node's chunks + the static collection
  assert.match(graph, /collection: "handbook"/)
  assert.match(graph, new RegExp(`texts: ref\\("${splitId}", "chunks"\\)`))

  // no throwing #902 vector stub for the ingested store
  assert.ok(
    !files['ingestHandbook/functions/vectorStub__qdrantVectorStore.function.ts']
  )

  // qdrant addon wired
  const addons = files['ingestHandbook/ingestHandbook.addons.gen.ts']
  assert.match(addons, /@pikku\/addon-qdrant/)
})

test('expressions nested inside array/object params are lowered element-wise, not emitted raw', () => {
  const parsed = parseN8n(loadFixture('nested-expression-containers.json'))
  const { files } = generateWorkflowFromN8n(parsed)

  const graph = files['nestedExpr/nestedExpr.graph.ts']
  assert.ok(graph, 'graph file emitted')

  // an expression inside an array element is lowered to a ref, and its
  // literal siblings survive untouched
  assert.match(
    graph,
    /"recipients": \[ref\("trigger", "body\.email"\), "ops@example\.com"\]/
  )

  // ...and inside an object value
  assert.match(
    graph,
    /"payload": \{ "dealId": ref\("trigger", "body\.id"\), "source": "webhook" \}/
  )

  // templates lower inside containers too
  assert.match(
    graph,
    /"greetings": \[template\("Hello \$0", \[ref\("trigger", "body\.name"\)\]\)\]/
  )

  // an expression-free container keeps the original safeJson path
  assert.match(graph, /"tags": \["blue","green"\]/)

  // the raw n8n expression must never reach generated code
  assert.doesNotMatch(graph, /\{\{/)
})
