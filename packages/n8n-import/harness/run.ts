/**
 * Coverage harness for @pikku/n8n-import.
 *
 * Runs a corpus of n8n workflow JSON exports through parse → codegen → tsc and
 * classifies each as clean / partial / failed. Emits harness-report.json and
 * harness-report.md.
 *
 *   yarn harness                 # pinned fixtures/ (CI gate — must be 100% non-failed)
 *   yarn harness --dir <path>    # a folder of .json workflows
 *   yarn harness --full          # the gitignored full corpus at ./.corpus (or $N8N_CORPUS_DIR)
 *   yarn harness --limit 500     # cap the number processed
 *
 * The tsc pass verifies the emitted TypeScript is structurally sound against a
 * shimmed `#pikku` surface (harness/shim). It is NOT a full generated-types
 * typecheck — it catches broken emits (bad identifiers, arity, malformed
 * literals, dangling refs), not semantic mismatches with real project types.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'
import { parseN8n, UnsupportedTopologyError } from '../src/parse-n8n.js'
import { generateWorkflowFromN8n } from '../src/codegen.js'
import type { ParsedWorkflow } from '../src/types.js'

const harnessDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(harnessDir, '..')
const repoRoot = resolve(packageDir, '../..')

type Outcome = 'clean' | 'partial' | 'failed' | 'skipped'
type FailKind =
  | 'parse-error'
  | 'codegen-error'
  | 'tsc-error'
  | 'empty-emit'
  | 'external-subworkflow'
  | 'unsupported-topology'
  | null

interface WorkflowResult {
  index: number
  file: string
  name: string
  slug: string
  outcome: Outcome
  failKind: FailKind
  message?: string
  fileCount: number
  hasStub: boolean
  droppedExprs: number
  nodeRoles: string[]
  nodeTypes: string[]
}

function parseArgs(argv: string[]) {
  const args = { full: false, dir: '', limit: Infinity, keep: false, only: '' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--full') args.full = true
    else if (a === '--dir') args.dir = argv[++i] ?? ''
    else if (a === '--limit') args.limit = Number(argv[++i])
    else if (a === '--keep') args.keep = true
    else if (a === '--only') args.only = argv[++i] ?? ''
  }
  return args
}

function resolveCorpusDir(args: ReturnType<typeof parseArgs>): string {
  if (args.dir) return resolve(process.cwd(), args.dir)
  if (args.full)
    return process.env.N8N_CORPUS_DIR
      ? resolve(process.env.N8N_CORPUS_DIR)
      : join(packageDir, '.corpus')
  return join(packageDir, 'fixtures')
}

function findJsonFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full)
    }
  }
  if (statSync(dir).isDirectory()) walk(dir)
  return out.sort()
}

function tscBin(): string {
  const candidate = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc')
  return candidate
}

function writeTsconfig(projectDir: string) {
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      esModuleInterop: true,
      paths: {
        '#pikku/*': ['./shim/pikku/*'],
        '@pikku/core/workflow': ['./shim/core-workflow.ts'],
      },
    },
    include: ['**/*.ts'],
  }
  writeFileSync(
    join(projectDir, 'tsconfig.json'),
    JSON.stringify(tsconfig, null, 2)
  )
}

const STUB_ROLES = new Set([
  'integration',
  'agentTool',
  'code',
  'vectorStore',
  'control',
])

function classifyRoleStatus(role: string): 'supported' | 'stubbed' | 'skipped' {
  if (role === 'trigger' || role === 'sticky') return 'skipped'
  if (role === 'model' || role === 'memory' || role === 'outputParser')
    return 'skipped'
  if (role === 'agent' || role === 'set') return 'supported'
  if (STUB_ROLES.has(role)) return 'stubbed'
  return 'supported'
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const corpusDir = resolveCorpusDir(args)
  const files = findJsonFiles(corpusDir)
    .filter((f) => (args.only ? f.includes(args.only) : true))
    .slice(0, args.limit)

  if (files.length === 0) {
    console.error(`No .json workflows found in ${corpusDir}`)
    process.exit(1)
  }
  console.log(`Corpus: ${corpusDir} (${files.length} workflows)`)

  // The project must live inside the monorepo so bare specifiers (`zod`) and
  // ambient types resolve via the workspace node_modules.
  const tmpRoot = join(packageDir, '.harness-tmp')
  mkdirSync(tmpRoot, { recursive: true })
  const projectDir = mkdtempSync(join(tmpRoot, 'run-'))
  cpSync(join(harnessDir, 'shim'), join(projectDir, 'shim'), {
    recursive: true,
  })
  writeTsconfig(projectDir)

  const results: WorkflowResult[] = []
  const dirToIndex = new Map<string, number>()

  files.forEach((file, index) => {
    const rel = relative(corpusDir, file)
    let parsed: ParsedWorkflow | null = null
    const result: WorkflowResult = {
      index,
      file: rel,
      name: rel,
      slug: `w${index}`,
      outcome: 'failed',
      failKind: null,
      fileCount: 0,
      hasStub: false,
      droppedExprs: 0,
      nodeRoles: [],
      nodeTypes: [],
    }

    try {
      const raw = JSON.parse(readFileSync(file, 'utf-8'))
      parsed = parseN8n(raw)
      result.name = parsed.name
      result.nodeRoles = parsed.nodes.map((n) => n.role)
      result.nodeTypes = parsed.nodes.map((n) => n.typeShort)
    } catch (err) {
      // A by-design unsupported topology (e.g. mid-flow respondToWebhook) is a
      // deliberate skip, not an importer defect — account for it as such.
      if (err instanceof UnsupportedTopologyError) {
        result.outcome = 'skipped'
        result.failKind = 'unsupported-topology'
      } else {
        result.failKind = 'parse-error'
      }
      result.message = (err as Error).message
      results.push(result)
      return
    }

    const projSlug = `w${index}_${parsed.slug}`.slice(0, 80)
    result.slug = projSlug
    dirToIndex.set(projSlug, index)

    try {
      const { files: emitted, diagnostics } = generateWorkflowFromN8n(parsed)
      const keys = Object.keys(emitted)
      result.fileCount = keys.length
      if (keys.length === 0) {
        // A workflow that emits nothing solely because it calls a sub-workflow
        // living in the author's n8n instance (not exported here) or chosen at
        // runtime is un-importable by design, not an importer defect — n8n
        // workflows reference each other by instance-local id. Account for it
        // as skipped/external, distinct from real failures.
        const errs = diagnostics.filter((d) => d.type === 'error')
        const allSubflow =
          errs.length > 0 &&
          errs.every(
            (d) =>
              d.reason === 'missing-subworkflow' ||
              d.reason === 'dynamic-subworkflow-target'
          )
        if (allSubflow) {
          result.outcome = 'skipped'
          result.failKind = 'external-subworkflow'
        } else {
          result.failKind = 'empty-emit'
        }
        results.push(result)
        return
      }
      // A throwing stub marks itself with "implement me"; a translated Code
      // node emits a real function file with no such marker. Classify on
      // content, not on the mere presence of a functions/ file, so translated
      // workflows can reach `clean`.
      result.hasStub = Object.entries(emitted).some(
        ([k, c]) => k.includes('/functions/') && c.includes('implement me')
      )
      result.droppedExprs = Object.values(emitted).reduce(
        (n, c) => n + (c.match(/\/\/ TODO\(n8n expr\):/g)?.length ?? 0),
        0
      )
      for (const [path, content] of Object.entries(emitted)) {
        // Re-root every workflow under its own namespaced dir.
        const rerooted = path.replace(parsed.slug, projSlug)
        const target = join(projectDir, rerooted)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, content)
      }
    } catch (err) {
      result.failKind = 'codegen-error'
      result.message = (err as Error).message
      results.push(result)
      return
    }

    // provisional — upgraded/downgraded after tsc
    result.outcome = result.hasStub ? 'partial' : 'clean'
    result.failKind = null
    results.push(result)
  })

  // One tsc pass over the whole project.
  console.log('Running tsc over emitted project…')
  const tsc = spawnSync(
    process.execPath,
    [tscBin(), '-p', join(projectDir, 'tsconfig.json')],
    { cwd: projectDir, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 1024 }
  )
  if (tsc.error) {
    console.error(`tsc failed to run: ${tsc.error.message}`)
    process.exit(1)
  }
  const tscOut = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`
  // A non-zero exit with zero attributable errors means tsc bailed globally
  // (bad config, missing lib) — fail loudly rather than silently pass all.
  if (tsc.status !== 0 && !/error TS/.test(tscOut)) {
    console.error(
      `tsc exited ${tsc.status} with no TS diagnostics:\n${tscOut.slice(0, 2000)}`
    )
    process.exit(1)
  }

  // Attribute tsc errors to workflows by their namespaced dir prefix.
  const erroredDirs = new Set<string>()
  const errorLine = /^([^\s(]+)\((\d+),(\d+)\): error TS/gm
  let m: RegExpExecArray | null
  while ((m = errorLine.exec(tscOut)) !== null) {
    const top = m[1]!.split('/')[0]!
    if (dirToIndex.has(top)) erroredDirs.add(top)
  }

  for (const r of results) {
    if (r.failKind === null && erroredDirs.has(r.slug)) {
      r.outcome = 'failed'
      r.failKind = 'tsc-error'
    }
    // By-design skips (external-subworkflow, unsupported-topology) carry a
    // failKind but are not failures — leave their 'skipped' outcome. Every
    // other failKind means a real failure.
    if (r.failKind !== null && r.outcome !== 'skipped') r.outcome = 'failed'
  }

  // ---- Roll-up ---------------------------------------------------------------
  const total = results.length
  const clean = results.filter((r) => r.outcome === 'clean').length
  const partial = results.filter((r) => r.outcome === 'partial').length
  const failed = results.filter((r) => r.outcome === 'failed').length
  const skipped = results.filter((r) => r.outcome === 'skipped').length

  const failTax: Record<string, number> = {}
  for (const r of results)
    if (r.failKind && r.outcome === 'failed')
      failTax[r.failKind] = (failTax[r.failKind] ?? 0) + 1

  // Expressions the classifier could not lower declaratively, dropped to a
  // `// TODO(n8n expr)` comment at emit time. A field-level coverage signal
  // orthogonal to clean/partial (a clean workflow can still shed a transform).
  const droppedExprTotal = results.reduce((n, r) => n + r.droppedExprs, 0)
  const workflowsWithDroppedExprs = results.filter(
    (r) => r.droppedExprs > 0
  ).length

  const typeFreq = new Map<string, number>()
  const typeStatus = new Map<string, string>()
  for (const r of results) {
    r.nodeTypes.forEach((t, i) => {
      typeFreq.set(t, (typeFreq.get(t) ?? 0) + 1)
      if (!typeStatus.has(t))
        typeStatus.set(t, classifyRoleStatus(r.nodeRoles[i] ?? 'other'))
    })
  }
  const typeTable = [...typeFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      type,
      count,
      status: typeStatus.get(type) ?? 'unknown',
    }))

  const pct = (n: number) => ((100 * n) / total).toFixed(1)
  const report = {
    corpus: corpusDir,
    total,
    clean,
    partial,
    failed,
    skipped,
    cleanPct: pct(clean),
    partialPct: pct(partial),
    failedPct: pct(failed),
    skippedPct: pct(skipped),
    droppedExprTotal,
    workflowsWithDroppedExprs,
    failureTaxonomy: failTax,
    nodeTypes: typeTable,
    failures: results
      .filter((r) => r.outcome === 'failed')
      .map((r) => ({
        file: r.file,
        failKind: r.failKind,
        message: r.message,
      })),
  }

  const outDir = packageDir
  writeFileSync(
    join(outDir, 'harness-report.json'),
    JSON.stringify(report, null, 2)
  )
  writeFileSync(join(outDir, 'harness-report.md'), renderMarkdown(report))

  console.log(
    `\n${clean} clean / ${partial} partial / ${failed} failed / ${skipped} skipped  ` +
      `(${pct(clean)}% / ${pct(partial)}% / ${pct(failed)}% / ${pct(skipped)}%) of ${total}`
  )
  console.log(
    `${droppedExprTotal} dropped n8n expressions across ${workflowsWithDroppedExprs} workflows`
  )
  console.log(`Reports: ${join(outDir, 'harness-report.md')}`)

  if (!args.keep) rmSync(projectDir, { recursive: true, force: true })

  // CI gate: on the pinned fixtures, nothing may fail.
  const isFixtures = corpusDir === join(packageDir, 'fixtures')
  if (isFixtures && failed > 0) {
    console.error(
      `\nCI gate failed: ${failed} fixture(s) did not import clean.`
    )
    process.exit(1)
  }
}

function renderMarkdown(report: ReturnType<typeof buildReport>): string {
  const lines: string[] = []
  lines.push(`# n8n-import coverage report`)
  lines.push('')
  lines.push(`Corpus: \`${report.corpus}\``)
  lines.push('')
  lines.push(`## Headline`)
  lines.push('')
  lines.push(`| Outcome | Count | % |`)
  lines.push(`| --- | ---: | ---: |`)
  lines.push(`| clean | ${report.clean} | ${report.cleanPct}% |`)
  lines.push(`| partial | ${report.partial} | ${report.partialPct}% |`)
  lines.push(`| failed | ${report.failed} | ${report.failedPct}% |`)
  lines.push(
    `| skipped (external subflow) | ${report.skipped} | ${report.skippedPct}% |`
  )
  lines.push(`| **total** | **${report.total}** | |`)
  lines.push('')
  lines.push(
    `Dropped n8n expressions: **${report.droppedExprTotal}** across ` +
      `**${report.workflowsWithDroppedExprs}** workflows.`
  )
  lines.push('')
  lines.push(`## Failure taxonomy`)
  lines.push('')
  const tax = Object.entries(report.failureTaxonomy)
  if (tax.length === 0) lines.push(`_No failures._`)
  else {
    lines.push(`| kind | count |`)
    lines.push(`| --- | ---: |`)
    for (const [k, v] of tax.sort((a, b) => b[1] - a[1]))
      lines.push(`| ${k} | ${v} |`)
  }
  lines.push('')
  lines.push(`## Node types by frequency`)
  lines.push('')
  lines.push(`| node type | count | status |`)
  lines.push(`| --- | ---: | --- |`)
  for (const t of report.nodeTypes.slice(0, 60))
    lines.push(`| ${t.type} | ${t.count} | ${t.status} |`)
  lines.push('')
  if (report.failures.length > 0) {
    lines.push(`## Sample failures`)
    lines.push('')
    for (const f of report.failures.slice(0, 40))
      lines.push(`- \`${f.file}\` — **${f.failKind}** ${f.message ?? ''}`)
  }
  return lines.join('\n') + '\n'
}

// Type helper so renderMarkdown's param is inferred.
function buildReport() {
  return {} as {
    corpus: string
    total: number
    clean: number
    partial: number
    failed: number
    skipped: number
    cleanPct: string
    partialPct: string
    failedPct: string
    skippedPct: string
    failureTaxonomy: Record<string, number>
    nodeTypes: { type: string; count: number; status: string }[]
    failures: { file: string; failKind: FailKind; message?: string }[]
  }
}

main()
