/**
 * Live "is every integration the corpus uses actually configured?" report — the
 * true corpus-passing metric. Unlike coverage-map.ts (static hand-maintained
 * lists), this reflects reality: it scans the sibling addons repo for genuinely
 * BUILT addons (`dist/.pikku` present) and probes the integration-map for which
 * services emit a real addon rpc (MAPPED). For every integration/agent-tool node
 * type in the corpus it reports: instances | addon built? | mapped? and ranks
 * the two gaps that matter — BUILD (no addon) and MAP (addon exists, unmapped).
 *
 *   node --import tsx harness/addon-coverage.ts [--dir <corpus> ...]
 *
 * PIKKU_ADDONS_ROOT overrides the addons repo (defaults to ../../../addons).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseN8n } from '../src/parse-n8n.js'
import { nativeSpecFor } from '../src/native-map.js'

const harnessDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(harnessDir, '..')
const repoRoot = resolve(packageDir, '../..')
const addonsRepoRoot =
  process.env.PIKKU_ADDONS_ROOT || resolve(repoRoot, '..', 'addons')

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// Community / third-party nodes NOT shipped in n8n's nodes-base — out of scope for
// addon coverage (their source isn't in the vendored .n8n checkout, so we can't
// derive an addon; per project decision we ignore those workflows). Norm'd keys.
const COMMUNITY_SKIP = new Set(
  [
    'klicktipp',
    'hdwLinkedin',
    'hdwLinkedinManagement',
    'hdwWebParser',
    'nostrobotsread',
    'dataForSeo',
    'evolutionApi',
    'brightData',
    'spontit',
    'ntfy',
    'cradlAi',
    'gcf',
    'exifData',
    'youtubeTranscripter',
    'documentGenerator',
  ].map(norm)
)

function firstJson(s: string): string {
  const t = s.replace(/^﻿/, '')
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (esc) {
      esc = false
      continue
    }
    if (c === '\\') {
      esc = true
      continue
    }
    if (c === '"') {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return t.slice(0, i + 1)
    }
  }
  return t
}

function load(f: string): unknown {
  const s = readFileSync(f, 'utf-8')
  try {
    return JSON.parse(s)
  } catch {
    return JSON.parse(firstJson(s))
  }
}

function walk(dir: string): string[] {
  const out: string[] = []
  const w = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name)
      if (e.isDirectory()) w(f)
      else if (e.name.endsWith('.json')) out.push(f)
    }
  }
  w(dir)
  return out
}

/** Normalized names of addons that are genuinely built (`dist/.pikku` present). */
function builtAddons(): Set<string> {
  const out = new Set<string>()
  const pkgsRoot = join(addonsRepoRoot, 'packages')
  if (!existsSync(pkgsRoot)) return out
  for (const cat of readdirSync(pkgsRoot, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue
    for (const svc of readdirSync(join(pkgsRoot, cat.name), {
      withFileTypes: true,
    })) {
      if (!svc.isDirectory()) continue
      const dir = join(pkgsRoot, cat.name, svc.name)
      const built = existsSync(
        join(dir, 'dist', '.pikku', 'function', 'pikku-functions-meta.gen.json')
      )
      if (!built) continue
      try {
        const name = JSON.parse(
          readFileSync(join(dir, 'package.json'), 'utf-8')
        ).name as string
        out.add(norm(name.replace(/^@pikku\/addon-/, '')))
      } catch {
        /* skip */
      }
    }
  }
  return out
}

/** True if the corpus service resolves to an addon rpc via the integration-map. */
function isMapped(typeShort: string): boolean {
  const spec = nativeSpecFor(typeShort, {})
  if (!spec) return false
  return spec.rpc.includes(':') && !spec.rpc.startsWith('graph:')
}

/** True if the node is a graph-native (`graph:*`) — a builtin, not a service. */
function isGraphNative(typeShort: string): boolean {
  const spec = nativeSpecFor(typeShort, {})
  return !!spec && spec.rpc.startsWith('graph:')
}

// n8n builtins the importer emits directly (control flow / io / triggers / data
// transforms handled by @pikku/addon-graph) — these need no per-service addon,
// but some parse as role `integration`, so exclude them from the build worklist.
const NATIVE_BUILTINS = new Set(
  [
    'httpRequest',
    'respondToWebhook',
    'executeWorkflow',
    'executeWorkflowTrigger',
    'toolWorkflow',
    'cron',
    'scheduleTrigger',
    'form',
    'formTrigger',
    'convertToFile',
    'readWriteFile',
    'extractFromFile',
    'noOp',
    'code',
    'function',
    'functionItem',
    'n8n',
    'editImage',
    'aggregate',
    'summarize',
    'itemLists',
    'dateTime',
    'splitOut',
    'splitInBatches',
    'limit',
    'merge',
    'filter',
    'removeDuplicates',
    'sort',
    'set',
    'if',
    'switch',
    'wait',
    'stopAndError',
    'compareDatasets',
    'renameKeys',
    // AI / LangChain cluster — absorbed into the agent path (pikkuAIAgent), not
    // per-service addons.
    'chainLlm',
    'toolWorkflow',
    'toolHttpRequest',
    'toolCode',
    'mcpClient',
    'mcpClientTool',
    'documentDefaultDataLoader',
    'textSplitterRecursiveCharacterTextSplitter',
    'textSplitterCharacterTextSplitter',
    'textSplitterTokenSplitter',
    'informationExtractor',
    'textClassifier',
    'sentimentAnalysis',
    'outputParserStructured',
    'chainSummarization',
    'chainRetrievalQa',
    'toolWikipedia',
    'toolCalculator',
    'toolSerpApi',
    'documentBinaryInputLoader',
    'documentJsonInputLoader',
    'retrieverWorkflow',
    'aiTransform',
    // n8n builtin triggers / debug / training-demo nodes — not real services.
    'interval',
    'start',
    'debugHelper',
    'n8nTrainingCustomerDatastore',
    'n8nTrainingCustomerMessenger',
    // Binary / core utility nodes — importer builtins, not services.
    'moveBinaryData',
    'readBinaryFile',
    'writeBinaryFile',
    'readBinaryFiles',
    'executeCommand',
    'executionData',
    'crypto',
    'graphql',
  ].map(norm)
)

/** Best-effort match of a corpus service name to a built addon. */
function addonFor(service: string, built: Set<string>): string | undefined {
  const n = norm(service)
  if (built.has(n)) return n
  for (const a of built) {
    if (a.length >= 5 && n.length >= 5 && (a.includes(n) || n.includes(a)))
      return a
  }
  return undefined
}

const dirs = process.argv.slice(2).filter((a) => a !== '--dir')
const corpusDirs = dirs.length ? dirs : ['.corpus', '.corpus-ai']

const freq: Record<string, number> = {}
let workflows = 0
for (const dir of corpusDirs) {
  let files: string[] = []
  try {
    files = walk(dir)
  } catch {
    continue
  }
  for (const f of files) {
    let p
    try {
      p = parseN8n(load(f))
    } catch {
      continue
    }
    workflows++
    for (const nd of p.nodes) {
      if (nd.disabled) continue
      const base = nd.typeShort.replace(/Tool$/, '')
      // A "service" node is one that becomes an external addon call or a stub:
      // unmapped services parse as `integration`/`agentTool`; once mapped they
      // ride the `native` addon-rpc path. Graph-builtin natives (mapping to
      // `graph:*`) are not services, so exclude native nodes that aren't mapped
      // to an addon.
      if (
        NATIVE_BUILTINS.has(norm(base)) ||
        COMMUNITY_SKIP.has(norm(base)) ||
        isGraphNative(base)
      )
        continue
      const isService =
        nd.role === 'integration' ||
        nd.role === 'agentTool' ||
        (nd.role === 'native' && isMapped(base))
      if (!isService) continue
      freq[base] = (freq[base] || 0) + 1
    }
  }
}

const built = builtAddons()
const rows = Object.entries(freq).sort((a, b) => b[1] - a[1])

type Row = { svc: string; count: number; addon?: string; mapped: boolean }
const table: Row[] = rows.map(([svc, count]) => ({
  svc,
  count,
  addon: addonFor(svc, built),
  mapped: isMapped(svc),
}))

const sum = (rs: Row[]) => rs.reduce((a, r) => a + r.count, 0)
const grand = sum(table)
const mapped = table.filter((r) => r.mapped)
const toMap = table.filter((r) => !r.mapped && r.addon)
const toBuild = table.filter((r) => !r.mapped && !r.addon)

console.log(
  `Corpus: ${workflows} workflows, ${grand} integration/agent-tool node instances across ${table.length} services\n`
)
console.log('=== configured coverage by instances ===')
const pct = (n: number) => `${((100 * n) / grand).toFixed(1)}%`.padStart(6)
console.log(
  `MAPPED (wired for real)   services:${String(mapped.length).padStart(4)}  instances:${String(sum(mapped)).padStart(6)}  ${pct(sum(mapped))}`
)
console.log(
  `ADDON BUILT, NOT MAPPED   services:${String(toMap.length).padStart(4)}  instances:${String(sum(toMap)).padStart(6)}  ${pct(sum(toMap))}`
)
console.log(
  `NO ADDON (build these)    services:${String(toBuild.length).padStart(4)}  instances:${String(sum(toBuild)).padStart(6)}  ${pct(sum(toBuild))}`
)

console.log('\n=== MAP THESE (addon already built — just needs a map) ===')
for (const r of toMap.slice(0, 40))
  console.log(
    String(r.count).padStart(5),
    r.svc.padEnd(24),
    `→ addon-${r.addon}`
  )

console.log('\n=== BUILD THESE (no addon), ranked ===')
for (const r of toBuild.slice(0, 50))
  console.log(String(r.count).padStart(5), r.svc)
