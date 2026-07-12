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
  const a: { dirs: string[]; limit: number; tsc: boolean } = {
    dirs: [],
    limit: Infinity,
    tsc: false,
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') a.dirs.push(argv[++i]!)
    else if (argv[i] === '--limit') a.limit = Number(argv[++i])
    else if (argv[i] === '--tsc') a.tsc = true
  }
  if (!a.dirs.length) a.dirs = ['.corpus', '.corpus-ai']
  return a
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const projectDir = join(packageDir, '.harness-tmp', 'wire-all')
  rmSync(projectDir, { recursive: true, force: true })
  mkdirSync(projectDir, { recursive: true })
  cpSync(seedDir, projectDir, { recursive: true })

  let scanned = 0,
    wireable = 0,
    pureGraph = 0,
    agentIncluded = 0,
    codegenErr = 0,
    skipped = 0,
    included = 0
  const requiredPkgs = new Set<string>()
  const includedSlugs: string[] = []
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
    // `graph-with-agent` is deferred: it inherits the graph-ref-typing problem
    // (a Set node reading a path off a mapped-native node whose typed output
    // doesn't expose it), which is orthogonal to the agent codegen.
    let kind: 'graph' | 'agent' | undefined
    if (p.shape === 'pure-graph' && wire) kind = 'graph'
    else if (p.shape === 'agent-only') kind = 'agent'
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
  // Collect the built addons a workflow's graph needs; returns false (and adds
  // nothing) if any required addon isn't built, so the caller can skip it.
  const collectAddons = (gen: Record<string, string>): boolean => {
    const staged: string[] = []
    for (const ns of requiredNamespaces(gen)) {
      const pkg = `@pikku/addon-${ns}`
      const dir = addonPackageDirs().get(pkg)
      if (dir && addonBuilt(dir)) staged.push(pkg)
      else return false
    }
    for (const pkg of staged) requiredPkgs.add(pkg)
    return true
  }
  const writeGen = (gen: Record<string, string>) => {
    for (const [rel, content] of Object.entries(gen)) {
      // addons wired globally below; manifest/json aren't compiled
      if (rel.endsWith('.addons.gen.ts') || rel.endsWith('.json')) continue
      const target = join(projectDir, 'src', rel)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content)
    }
  }

  for (const { p, uid, kind } of candidates) {
    if (included >= args.limit) break
    let gen: Record<string, string>
    try {
      // stub rpcs are prefixed per-workflow so several imports share one project
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
      // must have emitted a graph, and be a pure mapped graph (no generated
      // function files — no stubs / input-prep / code)
      if (!Object.keys(gen).some((k) => k.endsWith('.graph.ts'))) continue
      if (Object.keys(gen).some((k) => k.includes('/functions/'))) continue
      if (!collectAddons(gen)) continue
      pureGraph++
      writeGen(gen)
      includedSlugs.push(p.slug)
      includedUids.push(uid)
      included++
    } else {
      // agent workflow: must have emitted an agent; tool stubs are allowed, only
      // its graph's mapped-native addons must be built
      if (!Object.keys(gen).some((k) => k.endsWith('.agent.ts'))) continue
      if (!collectAddons(gen)) continue
      agentIncluded++
      writeGen(gen)
      includedAgentUids.push(uid)
      included++
    }
  }

  // one global addons file: one minimal wireAddon per required package
  if (requiredPkgs.size) {
    const blocks = [...requiredPkgs].map(
      (pkg) =>
        `wireAddon({ name: '${pkg.slice('@pikku/addon-'.length)}', package: '${pkg}' })`
    )
    const body = `import { wireAddon } from '@pikku/core/rpc'\n\n${blocks.join('\n')}\n`
    writeFileSync(join(projectDir, 'src', '_addons.gen.ts'), body)
  }
  // link built addons
  const scope = join(projectDir, 'node_modules', '@pikku')
  mkdirSync(scope, { recursive: true })
  for (const pkg of requiredPkgs) {
    const dest = join(scope, pkg.slice('@pikku/'.length))
    if (!existsSync(dest))
      symlinkSync(addonPackageDirs().get(pkg)!, dest, 'dir')
  }

  console.log(
    `scanned=${scanned} fullyWireable=${wireable} pureGraph=${pureGraph} agents=${agentIncluded} INCLUDED=${included} codegenErr=${codegenErr} skipped(diagnostic)=${skipped}`
  )
  console.log(`required addons=${requiredPkgs.size}`)
  console.log(
    `\nRunning pikku all${args.tsc ? ' --tsc' : ''} over ${included} workflows...\n`
  )

  const cmd = ['all', ...(args.tsc ? ['--tsc'] : []), '-c', 'pikku.config.json']
  const t0 = Date.now ? 0 : 0
  const res = spawnSync(process.execPath, [PIKKU_BIN, ...cmd], {
    cwd: projectDir,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`
  console.log(out.slice(-3000))
  console.log(`\npikku all exit: ${res.status}`)

  // Agents and pure graphs share one tsc run, so attribute each errored file to
  // its workflow uid to isolate the agent signal from unrelated graph errors.
  const erroredUids = new Set(
    [...out.matchAll(/src\/(w\d{4})_/g)].map((m) => m[1]!)
  )
  const agentUidSet = new Set(includedAgentUids)
  const agentErrored = [...erroredUids].filter((u) => agentUidSet.has(u))
  const graphErrored = [...erroredUids].filter((u) => !agentUidSet.has(u))
  if (args.tsc)
    console.log(
      `tsc errors by bucket: agent files=${agentErrored.length} workflow(s), graph files=${graphErrored.length} workflow(s)`
    )

  // check the generated workflow meta for every included workflow (keyed by uid prefix)
  const wfMetaDir = join(projectDir, '.pikku', 'workflow', 'meta')
  const wfMetaFiles = existsSync(wfMetaDir) ? readdirSync(wfMetaDir) : []
  const wfMetaBlob = wfMetaFiles.join('\n')
  let present = 0
  const missing: string[] = []
  for (const uid of includedUids) {
    if (new RegExp(`(^|[^0-9])${uid}([^0-9]|$)`).test(wfMetaBlob)) present++
    else missing.push(uid)
  }
  console.log(
    `\nWorkflow meta check: ${present}/${includedUids.length} pure graphs present in .pikku/workflow/meta (${wfMetaFiles.length} meta files)`
  )
  if (missing.length)
    console.log(
      `MISSING graphs (${missing.length}): ${missing.slice(0, 30).join(', ')}`
    )

  // agents are collected into one wirings-meta file, not a per-item dir
  const agentMetaFile = join(
    projectDir,
    '.pikku',
    'agent',
    'pikku-agent-wirings-meta.gen.json'
  )
  const agentBlob = existsSync(agentMetaFile)
    ? readFileSync(agentMetaFile, 'utf8')
    : ''
  let agentPresent = 0
  const agentMissing: string[] = []
  for (const uid of includedAgentUids) {
    if (new RegExp(`(^|[^0-9])${uid}([^0-9]|$)`).test(agentBlob)) agentPresent++
    else agentMissing.push(uid)
  }
  console.log(
    `Agent meta check: ${agentPresent}/${includedAgentUids.length} agents present in .pikku/agent/pikku-agent-wirings-meta.gen.json`
  )
  if (agentMissing.length)
    console.log(
      `MISSING agents (${agentMissing.length}): ${agentMissing.slice(0, 30).join(', ')}`
    )
  void includedSlugs
}
main()
