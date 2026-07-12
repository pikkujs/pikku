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
    codegenErr = 0,
    included = 0
  const requiredPkgs = new Set<string>()
  const includedSlugs: string[] = []
  const includedUids: string[] = []

  const files: string[] = []
  for (const d of args.dirs) {
    const abs = resolve(process.cwd(), d)
    if (existsSync(abs)) files.push(...walk(abs))
  }

  let idx = 0
  for (const f of files) {
    if (included >= args.limit) break
    let p: any
    try {
      p = parseN8n(readWf(f))
    } catch {
      continue
    }
    scanned++
    if (!fullyWireable(p)) continue
    wireable++
    if (p.shape !== 'pure-graph') continue
    // uniquify so graph const / name / dir never collide across the project
    const uid = `w${idx.toString().padStart(4, '0')}`
    p.name = `${uid} ${p.name}`
    p.slug = `${uid}_${p.slug}`
    let gen: Record<string, string>
    try {
      gen = generateWorkflowFromN8n(p).files
    } catch {
      codegenErr++
      continue
    }
    // pure mapped graph only: no generated function files (no stubs/input-prep/code)
    if (Object.keys(gen).some((k) => k.includes('/functions/'))) continue
    pureGraph++
    // collect required built addons
    const req = requiredNamespaces(gen)
    let allBuilt = true
    for (const ns of req) {
      const pkg = `@pikku/addon-${ns}`
      const dir = addonPackageDirs().get(pkg)
      if (dir && addonBuilt(dir)) requiredPkgs.add(pkg)
      else {
        allBuilt = false
        break
      }
    }
    if (!allBuilt) continue
    // write graph file(s); addons are registered globally below (one minimal
    // wireAddon per package — graph rpc refs target functions, not instances)
    for (const [rel, content] of Object.entries(gen)) {
      if (rel.endsWith('.addons.gen.ts')) continue
      const target = join(projectDir, 'src', rel)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content)
    }
    includedSlugs.push(p.slug)
    includedUids.push(uid)
    included++
    idx++
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
    `scanned=${scanned} fullyWireable=${wireable} pureGraph=${pureGraph} INCLUDED=${included} codegenErr=${codegenErr}`
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
    `\nWorkflow meta check: ${present}/${includedUids.length} workflows present in .pikku/workflow/meta (${wfMetaFiles.length} meta files)`
  )
  if (missing.length)
    console.log(
      `MISSING (${missing.length}): ${missing.slice(0, 30).join(', ')}`
    )
  void includedSlugs
}
main()
