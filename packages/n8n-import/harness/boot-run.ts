/**
 * Real-boot harness for the AI subset. For each workflow, ONE AT A TIME:
 *   parse → codegen → scaffold a real isolated Pikku project → `pikku all --tsc`
 *   (real codegen + real typecheck) → boot in-process in a fresh node → assert
 *   the functions/agents/graphs registered and every generated function is
 *   invocable (a stub throwing `— implement me` proves the wiring dispatched).
 *
 *   yarn boot                      # pinned AI fixtures (fixtures-ai/)
 *   yarn boot --dir <corpus>       # a folder of n8n AI workflow JSON exports
 *   yarn boot --limit 20
 *   yarn boot --keep               # keep each generated project
 *
 * Needs a built `pikku` CLI. Override the bin with PIKKU_BIN=<path to pikku.js>;
 * defaults to the worktree's packages/cli/dist/bin/pikku.js.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseN8n } from '../src/parse-n8n.js'
import { generateWorkflowFromN8n } from '../src/codegen.js'

const harnessDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(harnessDir, '..')
const repoRoot = resolve(packageDir, '../..')
const seedDir = join(harnessDir, 'seed')

const PIKKU_BIN =
  process.env.PIKKU_BIN ||
  join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'pikku.js')

type Outcome =
  | 'booted'
  | 'tsc-failed'
  | 'boot-failed'
  | 'parse-error'
  | 'codegen-error'

interface Result {
  file: string
  name: string
  shape: string
  outcome: Outcome
  message?: string
  functions?: number
  agents?: number
  graphs?: number
  allWired?: boolean
}

function parseArgs(argv: string[]) {
  const a = { dir: '', limit: Infinity, keep: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') a.dir = argv[++i] ?? ''
    else if (argv[i] === '--limit') a.limit = Number(argv[++i])
    else if (argv[i] === '--keep') a.keep = true
  }
  return a
}

/** Extract the first balanced JSON value — some corpus files have trailing junk. */
function firstJson(s: string): string {
  const t = s.replace(/^﻿/, '')
  let depth = 0,
    inStr = false,
    esc = false
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

function readWorkflow(file: string): unknown {
  const raw = readFileSync(file, 'utf-8')
  try {
    return JSON.parse(raw)
  } catch {
    return JSON.parse(firstJson(raw))
  }
}

function findJson(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name)
      if (e.isDirectory()) walk(f)
      else if (e.isFile() && e.name.endsWith('.json')) out.push(f)
    }
  }
  walk(dir)
  return out.sort()
}

function runPikku(projectDir: string) {
  return spawnSync(
    process.execPath,
    [PIKKU_BIN, 'all', '--tsc', '-c', 'pikku.config.json'],
    { cwd: projectDir, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 }
  )
}

function runBoot(projectDir: string) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', join(harnessDir, 'boot-assert.mts')],
    { cwd: projectDir, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 }
  )
}

function main() {
  if (!existsSync(PIKKU_BIN)) {
    console.error(
      `pikku CLI not found at ${PIKKU_BIN}.\nBuild it (packages/cli: yarn build) or set PIKKU_BIN.`
    )
    process.exit(1)
  }

  const args = parseArgs(process.argv.slice(2))
  const corpusDir = args.dir
    ? resolve(process.cwd(), args.dir)
    : join(packageDir, 'fixtures-ai')
  if (!existsSync(corpusDir) || !statSync(corpusDir).isDirectory()) {
    console.error(`Corpus dir not found: ${corpusDir}`)
    process.exit(1)
  }
  const files = findJson(corpusDir).slice(0, args.limit)
  console.log(
    `Corpus: ${corpusDir} (${files.length} workflows)\nCLI: ${PIKKU_BIN}\n`
  )

  const tmpRoot = join(packageDir, '.harness-tmp', 'boot')
  mkdirSync(tmpRoot, { recursive: true })

  const results: Result[] = []
  files.forEach((file, i) => {
    const rel = relative(corpusDir, file)
    const r: Result = {
      file: rel,
      name: rel,
      shape: '?',
      outcome: 'parse-error',
    }

    let parsed
    try {
      parsed = parseN8n(readWorkflow(file))
      r.name = parsed.name
      r.shape = parsed.shape
    } catch (e: any) {
      r.message = String(e?.message).slice(0, 160)
      results.push(r)
      logLine(i, files.length, r)
      return
    }

    let files_: Record<string, string>
    try {
      files_ = generateWorkflowFromN8n(parsed).files
    } catch (e: any) {
      r.outcome = 'codegen-error'
      r.message = String(e?.message).slice(0, 160)
      results.push(r)
      logLine(i, files.length, r)
      return
    }

    const projectDir = mkdtempSync(join(tmpRoot, `w${i}-`))
    cpSync(seedDir, projectDir, { recursive: true })
    for (const [rp, content] of Object.entries(files_)) {
      // The generated addons.gen.ts wireAddon()s not-yet-installed packages and
      // is not referenced by any node yet (nodes still call stubs), so it's
      // forward-looking scaffolding — exclude it from the stub boot test.
      if (rp.endsWith('.addons.gen.ts')) continue
      const target = join(projectDir, 'src', rp)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content)
    }

    const gen = runPikku(projectDir)
    const genOut = `${gen.stdout ?? ''}${gen.stderr ?? ''}`
    if (
      gen.status !== 0 ||
      /error TS|Type check failed|Found errors/.test(genOut)
    ) {
      r.outcome = 'tsc-failed'
      r.message = extractTsErrors(genOut)
      results.push(r)
      logLine(i, files.length, r)
      if (!args.keep) rmSync(projectDir, { recursive: true, force: true })
      return
    }

    const boot = runBoot(projectDir)
    const bootOut = `${boot.stdout ?? ''}${boot.stderr ?? ''}`
    const m = bootOut.match(/BOOT_RESULT:(.+)/)
    if (!m) {
      r.outcome = 'boot-failed'
      r.message = bootOut.slice(-300)
    } else {
      const br = JSON.parse(m[1]!)
      if (!br.ok) {
        r.outcome = 'boot-failed'
        r.message = (br.error ?? '').slice(0, 200)
      } else {
        r.outcome = 'booted'
        r.functions = br.functions.length
        r.agents = br.agents.length
        r.graphs = br.graphs.length
        r.allWired = br.allWired
      }
    }
    results.push(r)
    logLine(i, files.length, r)
    if (!args.keep) rmSync(projectDir, { recursive: true, force: true })
  })

  report(results, corpusDir)
}

function extractTsErrors(out: string): string {
  const lines = out
    .split('\n')
    .filter((l) => /error TS|Found errors|- No /.test(l))
  return lines.slice(0, 4).join(' | ').slice(0, 300)
}

function logLine(i: number, total: number, r: Result) {
  const tag =
    r.outcome === 'booted'
      ? `booted (fn:${r.functions} ag:${r.agents} gr:${r.graphs} wired:${r.allWired})`
      : `${r.outcome} — ${r.message ?? ''}`
  console.log(`[${i + 1}/${total}] ${r.shape.padEnd(16)} ${tag}  :: ${r.file}`)
}

function report(results: Result[], corpusDir: string) {
  const total = results.length
  const by = (o: Outcome) => results.filter((r) => r.outcome === o).length
  const booted = by('booted')
  const report = {
    corpus: corpusDir,
    total,
    booted,
    tscFailed: by('tsc-failed'),
    bootFailed: by('boot-failed'),
    parseError: by('parse-error'),
    codegenError: by('codegen-error'),
    bootedPct: ((100 * booted) / total).toFixed(1),
    failures: results
      .filter((r) => r.outcome !== 'booted')
      .map((r) => ({ file: r.file, outcome: r.outcome, message: r.message })),
  }
  writeFileSync(
    join(packageDir, 'boot-report.json'),
    JSON.stringify(report, null, 2)
  )
  console.log(
    `\n${booted}/${total} booted (${report.bootedPct}%)  |  tsc-failed:${report.tscFailed} boot-failed:${report.bootFailed} parse:${report.parseError} codegen:${report.codegenError}`
  )
  console.log(`Report: ${join(packageDir, 'boot-report.json')}`)
}

main()
