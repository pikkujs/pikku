/**
 * Bulk "does the wired-for-real corpus actually compile?" harness.
 *
 * Imports every fully-wireable, pure-mapped-graph workflow into ONE Pikku
 * project, links the built addons, runs `pikku all` once (real codegen + meta),
 * then asserts every workflow is present in the generated workflow meta.
 *
 *   node --import tsx harness/wire-all.ts [--dir <corpus> ...] [--limit N] [--tsc]
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseN8n } from '../src/parse-n8n.js'
import { generateWorkflowFromN8n } from '../src/codegen.js'
import { nativeSpecFor } from '../src/native-map.js'

const harnessDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(harnessDir, '..')
const repoRoot = resolve(packageDir, '../..')
const seedDir = join(harnessDir, 'seed')
const addonsRepoRoot =
  process.env.PIKKU_ADDONS_ROOT || resolve(repoRoot, '..', 'addons')
const PIKKU_BIN =
  process.env.PIKKU_BIN ||
  join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'pikku.js')

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const SKIP = new Set([
  'klicktipp',
  'hdwlinkedin',
  'hdwlinkedinmanagement',
  'hdwwebparser',
  'nostrobotsread',
  'dataforseo',
  'evolutionapi',
  'brightdata',
  'spontit',
  'ntfy',
  'cradlai',
  'gcf',
  'exifdata',
  'youtubetranscripter',
  'documentgenerator',
])
const BUILTIN = new Set([
  'httprequest',
  'respondtowebhook',
  'executeworkflow',
  'executeworkflowtrigger',
  'toolworkflow',
  'cron',
  'scheduletrigger',
  'form',
  'formtrigger',
  'converttofile',
  'readwritefile',
  'extractfromfile',
  'noop',
  'code',
  'function',
  'functionitem',
  'n8n',
  'editimage',
  'aggregate',
  'summarize',
  'itemlists',
  'datetime',
  'splitout',
  'splitinbatches',
  'limit',
  'merge',
  'filter',
  'removeduplicates',
  'sort',
  'set',
  'if',
  'switch',
  'wait',
  'stopanderror',
  'comparedatasets',
  'renamekeys',
  'chainllm',
  'toolhttprequest',
  'toolcode',
  'mcpclient',
  'mcpclienttool',
  'documentdefaultdataloader',
  'textsplitterrecursivecharactertextsplitter',
  'textsplittercharactertextsplitter',
  'textsplittertokensplitter',
  'informationextractor',
  'textclassifier',
  'sentimentanalysis',
  'outputparserstructured',
  'chainsummarization',
  'chainretrievalqa',
  'toolwikipedia',
  'toolcalculator',
  'toolserpapi',
  'documentbinaryinputloader',
  'documentjsoninputloader',
  'retrieverworkflow',
  'aitransform',
  'interval',
  'start',
  'debughelper',
  'n8ntrainingcustomerdatastore',
  'n8ntrainingcustomermessenger',
  'movebinarydata',
  'readbinaryfile',
  'writebinaryfile',
  'readbinaryfiles',
  'executecommand',
  'executiondata',
  'crypto',
  'graphql',
])
const mapped = (t: string) => {
  const s = nativeSpecFor(t, {})
  return !!s && s.rpc.includes(':') && !s.rpc.startsWith('graph:')
}
const graphNative = (t: string) => {
  const s = nativeSpecFor(t, {})
  return !!s && s.rpc.startsWith('graph:')
}

function walk(d: string): string[] {
  const o: string[] = []
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = join(d, e.name)
    if (e.isDirectory()) o.push(...walk(f))
    else if (e.name.endsWith('.json')) o.push(f)
  }
  return o
}
function firstJson(s: string): string {
  const t = s.replace(/^﻿/, '')
  let d = 0,
    q = false,
    e = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (e) {
      e = false
      continue
    }
    if (c === '\\') {
      e = true
      continue
    }
    if (c === '"') {
      q = !q
      continue
    }
    if (q) continue
    if (c === '{' || c === '[') d++
    else if (c === '}' || c === ']') {
      d--
      if (!d) return t.slice(0, i + 1)
    }
  }
  return t
}
function readWf(f: string): any {
  const r = readFileSync(f, 'utf8')
  try {
    return JSON.parse(r)
  } catch {
    return JSON.parse(firstJson(r))
  }
}

function fullyWireable(p: any): boolean {
  for (const nd of p.nodes) {
    if (nd.disabled) continue
    const b = norm(nd.typeShort.replace(/Tool$/, ''))
    if (BUILTIN.has(b) || SKIP.has(b) || graphNative(nd.typeShort)) continue
    const isSvc =
      nd.role === 'integration' ||
      nd.role === 'agentTool' ||
      (nd.role === 'native' && mapped(nd.typeShort))
    if (!isSvc) continue
    if (!mapped(nd.typeShort)) return false
  }
  return true
}

function requiredNamespaces(files: Record<string, string>): Set<string> {
  const out = new Set<string>()
  for (const [rel, c] of Object.entries(files)) {
    if (!rel.endsWith('.graph.ts')) continue
    for (const m of c.matchAll(/["']([a-z][a-z0-9-]*):[A-Za-z0-9_]+["']/g))
      if (m[1] !== 'graph') out.add(m[1]!)
  }
  return out
}
let addonDirs: Map<string, string> | undefined
function addonPackageDirs(): Map<string, string> {
  if (addonDirs) return addonDirs
  const out = new Map<string, string>()
  const root = join(addonsRepoRoot, 'packages')
  if (existsSync(root))
    for (const cat of readdirSync(root, { withFileTypes: true })) {
      if (!cat.isDirectory()) continue
      for (const svc of readdirSync(join(root, cat.name), {
        withFileTypes: true,
      })) {
        if (!svc.isDirectory()) continue
        const dir = join(root, cat.name, svc.name)
        const pj = join(dir, 'package.json')
        if (!existsSync(pj)) continue
        try {
          const n = JSON.parse(readFileSync(pj, 'utf8')).name
          if (typeof n === 'string') out.set(n, dir)
        } catch {}
      }
    }
  return (addonDirs = out)
}
const addonBuilt = (dir: string) =>
  existsSync(
    join(dir, 'dist', '.pikku', 'function', 'pikku-functions-meta.gen.json')
  )

function parseArgs(argv: string[]) {
  const a: { dirs: string[]; limit: number; tsc: boolean; batch: number } = {
    dirs: [],
    limit: Infinity,
    tsc: false,
    batch: 120,
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') a.dirs.push(argv[++i]!)
    else if (argv[i] === '--limit') a.limit = Number(argv[++i])
    else if (argv[i] === '--tsc') a.tsc = true
    else if (argv[i] === '--batch') a.batch = Number(argv[++i])
  }
  if (!a.dirs.length) a.dirs = ['.corpus', '.corpus-ai']
  return a
}

/** Built addon packages a generated workflow's graph needs, or null if any is unbuilt. */
function requiredPackages(gen: Record<string, string>): string[] | null {
  const pkgs: string[] = []
  for (const ns of requiredNamespaces(gen)) {
    const pkg = `@pikku/addon-${ns}`
    const dir = addonPackageDirs().get(pkg)
    if (dir && addonBuilt(dir)) pkgs.push(pkg)
    else return null
  }
  return pkgs
}

interface IncludedItem {
  uid: string
  kind: 'graph' | 'agent'
  files: Record<string, string>
  pkgs: string[]
}

/**
 * Run one batch of workflows through `pikku all --tsc` in its own project so the
 * generated rpc/workflow map — and the addon type-graphs it pulls in — stays
 * small enough to type-check at a sane heap. The whole corpus in one project
 * OOMs; per-batch it doesn't. Returns each included uid's meta presence + which
 * uids produced tsc errors.
 */
function runBatch(
  items: IncludedItem[],
  batchDir: string,
  tsc: boolean
): {
  wfPresent: Set<string>
  agentPresent: Set<string>
  erroredUids: Set<string>
  exit: number | null
} {
  rmSync(batchDir, { recursive: true, force: true })
  mkdirSync(batchDir, { recursive: true })
  cpSync(seedDir, batchDir, { recursive: true })

  const pkgs = new Set<string>()
  for (const item of items) {
    for (const p of item.pkgs) pkgs.add(p)
    for (const [rel, content] of Object.entries(item.files)) {
      if (rel.endsWith('.addons.gen.ts') || rel.endsWith('.json')) continue
      const target = join(batchDir, 'src', rel)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content)
    }
  }

  if (pkgs.size) {
    const blocks = [...pkgs].map(
      (pkg) =>
        `wireAddon({ name: '${pkg.slice('@pikku/addon-'.length)}', package: '${pkg}' })`
    )
    writeFileSync(
      join(batchDir, 'src', '_addons.gen.ts'),
      `import { wireAddon } from '@pikku/core/rpc'\n\n${blocks.join('\n')}\n`
    )
  }
  const scope = join(batchDir, 'node_modules', '@pikku')
  mkdirSync(scope, { recursive: true })
  for (const pkg of pkgs) {
    const dest = join(scope, pkg.slice('@pikku/'.length))
    if (!existsSync(dest))
      symlinkSync(addonPackageDirs().get(pkg)!, dest, 'dir')
  }

  const cmd = ['all', ...(tsc ? ['--tsc'] : []), '-c', 'pikku.config.json']
  const res = spawnSync(process.execPath, [PIKKU_BIN, ...cmd], {
    cwd: batchDir,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    // Built addons are relied on via their prebuilt meta — but a batch's own
    // graphs + the addon maps they reference still need headroom. 4GB per batch
    // is plenty and keeps the whole run tractable, unlike one mega-project.
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=4096`,
    },
  })
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`

  const erroredUids = new Set(
    [...out.matchAll(/src\/(w\d{4})_/g)].map((m) => m[1]!)
  )
  const wfMetaDir = join(batchDir, '.pikku', 'workflow', 'meta')
  const wfMetaBlob = (existsSync(wfMetaDir) ? readdirSync(wfMetaDir) : []).join(
    '\n'
  )
  const agentMetaFile = join(
    batchDir,
    '.pikku',
    'agent',
    'pikku-agent-wirings-meta.gen.json'
  )
  const agentBlob = existsSync(agentMetaFile)
    ? readFileSync(agentMetaFile, 'utf8')
    : ''

  const wfPresent = new Set<string>()
  const agentPresent = new Set<string>()
  for (const item of items) {
    const re = new RegExp(`(^|[^0-9])${item.uid}([^0-9]|$)`)
    if (item.kind === 'graph' && re.test(wfMetaBlob)) wfPresent.add(item.uid)
    if (item.kind === 'agent' && re.test(agentBlob)) agentPresent.add(item.uid)
  }
  return { wfPresent, agentPresent, erroredUids, exit: res.status }
}

function main() {
  const args = parseArgs(process.argv.slice(2))

  let scanned = 0,
    wireable = 0,
    codegenErr = 0,
    skipped = 0
  const includedUids: string[] = []
  const includedAgentUids: string[] = []

  const files: string[] = []
  for (const d of args.dirs) {
    const abs = resolve(process.cwd(), d)
    if (existsSync(abs)) files.push(...walk(abs))
  }

  // Pass A — select candidates, assign uids, and index each workflow's own n8n
  // id → its (uniquified) registered name, so static executeWorkflow references
  // can be resolved to a real sub-workflow name across the import set.
  const candidates: Array<{ p: any; uid: string; kind: 'graph' | 'agent' }> = []
  const idIndex = new Map<string, string>()
  let idx = 0
  for (const f of files) {
    let raw: any
    try {
      raw = readWf(f)
    } catch {
      continue
    }
    let p: any
    try {
      p = parseN8n(raw)
    } catch {
      continue
    }
    scanned++
    const wire = fullyWireable(p)
    if (wire) wireable++
    // A pure mapped graph is included strictly (100%-wired, no stubs). An
    // agent-only workflow is included to validate the agent codegen — its tools
    // emit local stubs (which compile), so it needn't be fully mapped.
    // `graph-with-agent` is included the same way as agent-only: it emits a graph
    // + agent file whose stub nodes compile. (The historical graph-ref-typing
    // deferral was disproven — a graph node referencing an agent's output
    // type-checks; the remaining partials are ordinary stub nodes.)
    let kind: 'graph' | 'agent' | undefined
    if (p.shape === 'pure-graph' && wire) kind = 'graph'
    else if (p.shape === 'agent-only' || p.shape === 'graph-with-agent')
      kind = 'agent'
    if (!kind) continue
    // uniquify so graph/agent const / name / dir never collide across the project
    const uid = `w${idx.toString().padStart(4, '0')}`
    p.name = `${uid} ${p.name}`
    p.slug = `${uid}_${p.slug}`
    if (raw && raw.id != null) idIndex.set(String(raw.id), p.name)
    candidates.push({ p, uid, kind })
    idx++
  }
  const resolveWorkflowRef = (id: string) => idIndex.get(id)

  // Pass B — generate with cross-workflow resolution; a workflow that references
  // a missing / runtime-dynamic sub-workflow is skipped (diagnostic), not stubbed.
  // Nothing is written yet: items are collected, then run in batches so no single
  // tsc project grows large enough to OOM.
  const items: IncludedItem[] = []
  for (const { p, uid, kind } of candidates) {
    if (items.length >= args.limit) break
    let gen: Record<string, string>
    try {
      // stub rpcs are prefixed per-workflow so a batch can share one project
      // without a DUPLICATE_FUNCTION_NAME collision
      const r = generateWorkflowFromN8n(p, {
        resolveWorkflowRef,
        rpcPrefix: `${uid}_`,
      })
      if (r.diagnostics.some((d) => d.type === 'error')) {
        skipped++
        continue
      }
      gen = r.files
    } catch {
      codegenErr++
      continue
    }

    if (kind === 'graph') {
      // must have emitted a graph, and be a pure mapped graph (no stubs)
      if (!Object.keys(gen).some((k) => k.endsWith('.graph.ts'))) continue
      if (Object.keys(gen).some((k) => k.includes('/functions/'))) continue
    } else if (!Object.keys(gen).some((k) => k.endsWith('.agent.ts'))) continue
    const pkgs = requiredPackages(gen)
    if (pkgs === null) continue // a required addon isn't built — skip
    items.push({ uid, kind, files: gen, pkgs })
    if (kind === 'graph') includedUids.push(uid)
    else includedAgentUids.push(uid)
  }

  const pureGraph = includedUids.length
  const agentIncluded = includedAgentUids.length
  const allPkgs = new Set(items.flatMap((i) => i.pkgs))
  console.log(
    `scanned=${scanned} fullyWireable=${wireable} pureGraph=${pureGraph} agents=${agentIncluded} INCLUDED=${items.length} codegenErr=${codegenErr} skipped(diagnostic)=${skipped}`
  )
  console.log(`required addons=${allPkgs.size}`)

  // Run in batches so each tsc project stays small (see runBatch).
  const nBatches = Math.max(1, Math.ceil(items.length / args.batch))
  console.log(
    `\nRunning pikku all${args.tsc ? ' --tsc' : ''} in ${nBatches} batch(es) of up to ${args.batch}...\n`
  )
  const wfPresent = new Set<string>()
  const agentPresent = new Set<string>()
  const erroredUids = new Set<string>()
  for (let b = 0; b < nBatches; b++) {
    const batch = items.slice(b * args.batch, (b + 1) * args.batch)
    const batchDir = join(packageDir, '.harness-tmp', `batch-${b}`)
    const r = runBatch(batch, batchDir, args.tsc)
    r.wfPresent.forEach((u) => wfPresent.add(u))
    r.agentPresent.forEach((u) => agentPresent.add(u))
    r.erroredUids.forEach((u) => erroredUids.add(u))
    console.log(
      `  batch ${b + 1}/${nBatches}: ${batch.length} wf, exit=${r.exit}, errored=${[...r.erroredUids].length}`
    )
  }

  const agentUidSet = new Set(includedAgentUids)
  const agentErrored = [...erroredUids].filter((u) => agentUidSet.has(u))
  const graphErrored = [...erroredUids].filter((u) => !agentUidSet.has(u))
  const graphClean = pureGraph - graphErrored.length
  const agentClean = agentIncluded - agentErrored.length

  console.log(
    `\nWorkflow meta check: ${wfPresent.size}/${includedUids.length} pure graphs present in workflow meta`
  )
  console.log(
    `Agent meta check: ${agentPresent.size}/${includedAgentUids.length} agents present in agent meta`
  )
  if (args.tsc) {
    const pct = (n: number, d: number) =>
      d ? ((100 * n) / d).toFixed(1) : '100.0'
    console.log(
      `\ntsc CLEAN: graphs ${graphClean}/${pureGraph} (${pct(graphClean, pureGraph)}%), agents ${agentClean}/${agentIncluded} (${pct(agentClean, agentIncluded)}%)`
    )
  }
}
main()
