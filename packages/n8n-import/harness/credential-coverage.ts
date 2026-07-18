/**
 * Credential-coverage analysis over the full n8n corpus.
 *
 * For every workflow, classifies each node as credential-free (trigger / http /
 * `graph:*` builtin), credentialed-mapped (a real addon rpc that needs a
 * credential), or blocking (a stub / code / ai-agent node that throws no matter
 * what credentials you supply). A workflow is "runnable if credentialed" only
 * when it has NO blocking nodes; the credentials it then needs are the addon
 * services of its mapped nodes.
 *
 * Emits `corpus-credential-coverage.csv` (per-service frequency + auth type +
 * greedy cumulative unlock) so we can decide which credentials unlock the most
 * end-to-end-runnable imports.
 *
 *   N8N_CORPUS_DIR=<dir> node --import tsx harness/credential-coverage.ts
 *   (defaults to ./.corpus; addons repo via PIKKU_ADDONS_ROOT or ../../../addons)
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseN8n } from '../src/parse-n8n.js'
import { nativeSpecFor } from '../src/native-map.js'

const harnessDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(harnessDir, '..')
const corpusDir = process.env.N8N_CORPUS_DIR
  ? resolve(process.env.N8N_CORPUS_DIR)
  : join(packageDir, '.corpus')
const addonsRoot =
  process.env.PIKKU_ADDONS_ROOT ||
  resolve(packageDir, '../../..', 'addons')

function walk(dir: string): string[] {
  let out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out = out.concat(walk(p))
    else if (e.name.endsWith('.json')) out.push(p)
  }
  return out
}

/** addon rpc prefix (e.g. `google-sheets`) → { authType } from the addons repo. */
function buildAuthTypes(): Map<string, string> {
  const out = new Map<string, string>()
  const pkgsRoot = join(addonsRoot, 'packages')
  if (!existsSync(pkgsRoot)) return out
  for (const cat of readdirSync(pkgsRoot, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue
    const catDir = join(pkgsRoot, cat.name)
    for (const svc of readdirSync(catDir, { withFileTypes: true })) {
      if (!svc.isDirectory()) continue
      const srcDir = join(catDir, svc.name, 'src')
      if (!existsSync(srcDir)) continue
      const files = readdirSync(srcDir)
      const credFile = files.find((f) => f.endsWith('.credential.ts'))
      const hasSecret = files.some((f) => f.endsWith('.secret.ts'))
      const hasApiService = files.some((f) => /api.*\.service\.ts$/.test(f))
      let authType: string
      if (credFile) {
        const body = readFileSync(join(srcDir, credFile), 'utf8')
        authType = /oauth2\s*:/.test(body) ? 'oauth2' : 'api-key-credential'
      } else if (hasSecret) {
        authType = 'secret' // static key/token via the secrets service
      } else if (hasApiService) {
        authType = 'api-key-input' // key passed as a function input (easiest)
      } else {
        authType = 'none-local' // pure local processor — no auth at all
      }
      out.set(svc.name, authType)
    }
  }
  return out
}

const authTypes = buildAuthTypes()
const files = walk(corpusDir)

let parsed = 0
let threw = 0
let credFree = 0
let blocked = 0
const blockerReason = new Map<string, number>()
const svcWorkflowCount = new Map<string, number>() // no-blocker workflows using svc
const svcTotalCount = new Map<string, number>() // ALL workflows using svc (incl blocked)
const runnableNeedSets: Set<string>[] = [] // per no-blocker workflow: services needed

for (const f of files) {
  let p
  try {
    p = parseN8n(JSON.parse(readFileSync(f, 'utf8')))
  } catch {
    threw++
    continue
  }
  parsed++
  const services = new Set<string>()
  let blocker: string | null = null
  for (const n of p.nodes) {
    const r = n.role
    if (
      r === 'trigger' ||
      r === 'noop' ||
      r === 'http' ||
      r === 'branch' ||
      r === 'subworkflow'
    )
      continue
    if (r === 'native') {
      const rpc = nativeSpecFor(n.typeShort, n.parameters)?.rpc || ''
      if (rpc.startsWith('graph:')) continue
      if (rpc) {
        const svc = rpc.split(':')[0]!
        // Local-processor addons (markdown, read-pdf, html-extract…) need no
        // auth — treat like a builtin, not a credentialed service.
        if (authTypes.get(svc) === 'none-local') continue
        services.add(svc)
      }
      continue
    }
    if (r === 'integration') blocker = blocker || 'stub-integration'
    else if (r === 'code') blocker = blocker || 'code-node'
    else if (r === 'agent' || r === 'agentTool') blocker = blocker || 'ai-agent'
  }
  for (const s of services) svcTotalCount.set(s, (svcTotalCount.get(s) || 0) + 1)
  if (blocker) {
    blocked++
    blockerReason.set(blocker, (blockerReason.get(blocker) || 0) + 1)
    continue
  }
  if (services.size === 0) {
    credFree++
    continue
  }
  runnableNeedSets.push(services)
  for (const s of services)
    svcWorkflowCount.set(s, (svcWorkflowCount.get(s) || 0) + 1)
}

// Greedy set cover: order credentials by marginal #workflows fully unlocked.
const remaining = runnableNeedSets.map((s) => new Set(s))
const greedy: Array<{ svc: string; marginal: number; cumulative: number }> = []
let covered = 0
const owned = new Set<string>()
while (true) {
  const gain = new Map<string, number>()
  for (const need of remaining) {
    if ([...need].every((s) => owned.has(s))) continue
    const missing = [...need].filter((s) => !owned.has(s))
    if (missing.length === 1) gain.set(missing[0]!, (gain.get(missing[0]!) || 0) + 1)
  }
  if (gain.size === 0) break
  const [best, marginal] = [...gain.entries()].sort((a, b) => b[1] - a[1])[0]!
  owned.add(best)
  covered += marginal
  greedy.push({ svc: best, marginal, cumulative: covered })
}

const allSvcs = new Set([...svcWorkflowCount.keys(), ...svcTotalCount.keys()])
const greedyRank = new Map(greedy.map((g, i) => [g.svc, i + 1]))
const greedyCum = new Map(greedy.map((g) => [g.svc, g.cumulative]))

const rows = [...allSvcs]
  .map((svc) => ({
    service: svc,
    auth_type: authTypes.get(svc) ?? 'unknown',
    workflows_runnable_using: svcWorkflowCount.get(svc) ?? 0,
    workflows_total_using: svcTotalCount.get(svc) ?? 0,
    greedy_priority: greedyRank.get(svc) ?? '',
    greedy_cumulative_unlocked: greedyCum.get(svc) ?? '',
  }))
  .sort(
    (a, b) => b.workflows_runnable_using - a.workflows_runnable_using
  )

const header =
  'service,auth_type,workflows_runnable_using,workflows_total_using,greedy_priority,greedy_cumulative_unlocked'
const csv = [
  `# n8n corpus credential coverage — ${files.length} workflows, ${parsed} parsed (${threw} parse-skipped)`,
  `# credential_free_runnable_now=${credFree}  runnable_if_credentialed=${runnableNeedSets.length}  blocked_by_stub_code_agent=${blocked} ${JSON.stringify(Object.fromEntries(blockerReason))}`,
  `# workflows_runnable_using = #no-blocker workflows using this service (need its credential to run)`,
  `# workflows_total_using = #workflows using it incl. those blocked by OTHER stub/code/agent nodes`,
  `# greedy_priority / greedy_cumulative_unlocked = greedy set-cover: add credentials in this order to unlock the most fully-runnable workflows fastest`,
  `# auth_type: oauth2 (needs OAuth app+flow — hardest), secret (static token via secrets service), api-key-credential (wire cred, static key), api-key-input (key passed as fn input), none-local (no auth — local processor), unknown (unmapped)`,
  header,
  ...rows.map(
    (r) =>
      `${r.service},${r.auth_type},${r.workflows_runnable_using},${r.workflows_total_using},${r.greedy_priority},${r.greedy_cumulative_unlocked}`
  ),
].join('\n')

const outPath = join(packageDir, 'corpus-credential-coverage.csv')
writeFileSync(outPath, csv + '\n')
console.log(`Wrote ${outPath}`)
console.log(
  `credential-free now: ${credFree} | runnable if credentialed: ${runnableNeedSets.length} | blocked: ${blocked}`
)
console.log('\nGreedy unlock order (top 15):')
for (const g of greedy.slice(0, 15))
  console.log(
    `  +${String(g.marginal).padStart(3)}  →  ${String(g.cumulative).padStart(4)} total   ${g.svc}  (${authTypes.get(g.svc) ?? 'unknown'})`
  )
