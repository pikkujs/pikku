#!/usr/bin/env node
// Emit the Pikku implementation inventory for a .knowledge/ blueprint.
//
//   node inventory.mjs <path-to-.knowledge> [--json] [--domain <Name>]
//
// Answers "what will actually be built?" BEFORE any code exists: every pikkuFunc,
// permission, scheduler, queue worker, workflow, HTTP wiring, event channel,
// table and scenario — plus, crucially, what is BLOCKED by an unresolved decision
// and what is deliberately NOT built.
//
// This is a projection of the blueprint, not a plan you write by hand. It is
// derived, so it stays honest: if it says 187 functions, the blueprint says 187.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
const asJson = process.argv.includes('--json')
const domainArg = process.argv.includes('--domain')
  ? process.argv[process.argv.indexOf('--domain') + 1]
  : null

if (!dir) {
  console.error('usage: inventory.mjs <path-to-.knowledge> [--json] [--domain <Name>]')
  process.exit(2)
}

const read = (f) => {
  const p = join(dir, f)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf-8'))
}

const domains = read('domains.json')?.domains ?? []
const entities = read('entities.json')?.entities ?? []
const commands = read('commands.json')?.commands ?? []
const queries = read('queries.json')?.queries ?? []
const events = read('events.json')?.events ?? []
const policies = read('policies.json')?.policies ?? []
const workflows = read('workflows.json')?.workflows ?? []
const api = read('api.json')?.surfaces ?? read('api.json')?.api ?? []
const integrations = read('integrations.json')?.integrations ?? []
const migration = read('migration.json') ?? {}
const interfaces = read('interfaces.json')?.interfaces ?? []
const feComponents = read('frontend-components.json')?.components ?? []
const feRoutes = read('frontend-routes.json')?.routes ?? []

// ---- the decisions gate -----------------------------------------------------
// A concept named in an unresolved decision's blockedConcepts cannot be built.
//
// Answers are recorded OUTSIDE the blueprint — in the rebuild's own knowledge
// base — because the blueprint is a record of the LEGACY app and must not be
// rewritten as the rebuild proceeds. So pass the ones already answered:
//
//   --resolved 1,2,3        (1-based index into migration.json.decisionsNeeded)
//
// Anything not listed is still blocking.
const allDecisions = migration.decisionsNeeded ?? []
const resolvedArg = process.argv.includes('--resolved')
  ? process.argv[process.argv.indexOf('--resolved') + 1]
  : ''
const resolvedIdx = new Set(
  resolvedArg.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean)
)
const decisions = allDecisions.filter((_, i) => !resolvedIdx.has(i + 1))
const resolved = allDecisions.filter((_, i) => resolvedIdx.has(i + 1))
const blocked = new Map() // concept -> question
for (const d of decisions) {
  for (const c of d.blockedConcepts ?? []) {
    if (!blocked.has(c)) blocked.set(c, d.question)
  }
}
const dropped = migration.dropped ?? []
const droppedNames = new Set(
  dropped.map((d) => (d.path ?? d.file ?? '').split('/').pop())
)

const isBlocked = (name, domain) => blocked.has(name) || blocked.has(domain)

// ---- classification ---------------------------------------------------------
// Cron-ish triggers. The blueprint records schedules in prose ("daily at 05:00",
// "every minute"), because that is how the legacy code expressed them.
const CRON = /(cron|daily|nightly|hourly|every minute|every \d|schedule|at \d{2}:\d{2})/i
const QUEUE = /(queue|consumer|perform_later|sidekiq|worker|async)/i
const WEBHOOK = /(webhook|POST \/webhooks)/i
// A trigger that fires off a row write is the legacy shape of an EVENT, not of a
// workflow — a handler doing five unrelated things because there was no bus.
// These become an event + its consumers, which is the structural upgrade.
const EVENT = /(after_commit|after_save|on create\/update\/destroy|observer|callback|mirror)/i

const classifyWorkflow = (w) => {
  const t = `${w.name} ${w.trigger ?? ''}`
  if (w.kind === 'system') {
    if (WEBHOOK.test(t)) return 'wireHTTP + command (webhook ingress)'
    if (CRON.test(t)) return 'wireScheduler'
    if (EVENT.test(t)) return 'event consumer (realtime/queue)'
    if (QUEUE.test(t)) return 'wireQueueWorker'
    return 'pikkuWorkflowFunc'
  }
  // User and admin journeys are NOT pikku workflows — they are sequences of
  // commands a person drives through the UI. They become scenarios.
  return 'scenario (user journey)'
}

// HTTP is warranted ONLY where the caller is a system we do not control and
// cannot ask to speak RPC — i.e. it POSTs to a URL we publish, on its schedule.
// In practice that means inbound webhooks.
//
// Everything else is RPC, including surfaces that look like they need HTTP:
//   - `auth: none` means anonymous, not external. Our own sign-up page calls it.
//   - a tokened/capability URL (a check-in link, a public share link) is a
//     first-party page reading a token; the page can call RPC like any other.
// The caller being ours is what decides this, not the URL's shape or its auth.
const needsHttp = (s) => /webhook/i.test(s.path ?? '')

const byDomain = (arr) => {
  const m = new Map()
  for (const x of arr) {
    const d = x.domain ?? 'unassigned'
    if (!m.has(d)) m.set(d, [])
    m.get(d).push(x)
  }
  return m
}

const cmdByDomain = byDomain(commands)
const qryByDomain = byDomain(queries)
const polByDomain = byDomain(policies)
const evtByDomain = byDomain(events)
const entByDomain = byDomain(entities)

const schedulers = workflows.filter((w) => classifyWorkflow(w) === 'wireScheduler')
const queueWorkers = workflows.filter((w) => classifyWorkflow(w) === 'wireQueueWorker')
const ingress = workflows.filter((w) => classifyWorkflow(w).startsWith('wireHTTP'))
const eventConsumers = workflows.filter((w) => classifyWorkflow(w) === 'event consumer (realtime/queue)')
const pikkuWorkflows = workflows.filter((w) => classifyWorkflow(w) === 'pikkuWorkflowFunc')
const journeys = workflows.filter((w) => classifyWorkflow(w) === 'scenario (user journey)')
const httpSurfaces = api.filter(needsHttp)
const scenarioCount = workflows.reduce((n, w) => n + (w.scenarios ?? []).length, 0)

const blockedCommands = commands.filter((c) => isBlocked(c.name, c.domain))
const blockedQueries = queries.filter((q) => isBlocked(q.name, q.domain))
const customLogic = feComponents.filter((c) => c.rebuild === 'custom-logic')
const cheapComponents = feComponents.filter((c) => c.rebuild !== 'custom-logic')

// ---- addons -----------------------------------------------------------------
// An addon is warranted where a capability is self-contained, reused across
// domains, and has a clear service seam — which is what a `hard`/`critical`
// integration is. Advisory: the call is the operator's.
const addonCandidates = integrations.filter(
  (i) => i.importance === 'critical' || i.replacementDifficulty === 'hard'
)

if (asJson) {
  console.log(
    JSON.stringify(
      {
        totals: {
          pikkuFunc: commands.length,
          pikkuSessionlessFuncReadonly: queries.length,
          pikkuPermission: policies.length,
          wireScheduler: schedulers.length,
          wireQueueWorker: queueWorkers.length,
          webhookIngress: ingress.length,
          pikkuWorkflowFunc: pikkuWorkflows.length,
          wireHTTP: httpSurfaces.length,
          eventChannels: events.length,
          tables: entities.length,
          scenarios: scenarioCount,
          blockedCommands: blockedCommands.length,
          blockedQueries: blockedQueries.length,
          droppedArtifacts: dropped.length,
          customLogicComponents: customLogic.length,
        },
        blocked: [...blocked.entries()].map(([concept, question]) => ({ concept, question })),
      },
      null,
      2
    )
  )
  process.exit(0)
}

// ---- report -----------------------------------------------------------------
const out = []
const p = (s = '') => out.push(s)

p('# Pikku implementation inventory')
p('')
p(`Derived from \`${dir}\`. Every number below is a projection of the blueprint —`)
p('nothing here is estimated or invented.')
p('')

p('## Totals')
p('')
p('| Pikku artifact | Count | From |')
p('|---|---:|---|')
p(`| \`pikkuFunc\` (state-changing) | ${commands.length} | \`commands.json\` |`)
p(`| \`pikkuSessionlessFunc\` + \`readonly: true\` | ${queries.length} | \`queries.json\` |`)
p(`| \`pikkuPermission\` | ${policies.length} | \`policies.json\` |`)
p(`| \`wireScheduler\` | ${schedulers.length} | \`workflows.json\` (system + cron) |`)
p(`| \`wireQueueWorker\` | ${queueWorkers.length} | \`workflows.json\` (system + queue) |`)
p(`| webhook ingress (\`wireHTTP\` + command) | ${ingress.length} | \`workflows.json\` (system + webhook) |`)
p(`| \`pikkuWorkflowFunc\` | ${pikkuWorkflows.length} | \`workflows.json\` (system, multi-step) |`)
p(`| \`wireHTTP\` (fixed external URLs only) | ${httpSurfaces.length} of ${api.length} surfaces | \`api.json\` |`)
p(`| event channels (realtime/queue) | ${events.length} | \`events.json\` |`)
p(`| tables | ${entities.length} | \`entities.json\` |`)
p(`| scenarios | ${scenarioCount} | \`workflows.json[].scenarios\` |`)
p('')
p(`**Not built:** ${dropped.length} dropped artifacts · **Blocked:** ${blockedCommands.length + blockedQueries.length} concepts behind ${decisions.length} open decisions.`)
p('')

if (resolved.length) {
  p('## Decisions already taken')
  p('')
  p('Answered at the gate and recorded in the rebuild\'s knowledge base. Each is a')
  p('**deliberate behaviour change** and belongs in the parity report.')
  p('')
  for (const d of resolved) p(`- ${(d.blockedConcepts ?? []).join(', ')} — _${d.question.split('.')[0]}._`)
  p('')
}

p('## Blocked by an open decision')
p('')
if (decisions.length === 0) {
  p('_None — the gate is clear._')
} else {
  p('These cannot be built until the question is answered. They block **their own')
  p('domains only** — every other slice proceeds.')
  p('')
  for (const d of decisions) {
    p(`- **${(d.blockedConcepts ?? []).join(', ') || '(unscoped)'}**`)
    p(`  <br>${d.question}`)
    if (d.options) p(`  <br>_Options:_ ${d.options.join(' · ')}`)
  }
}
p('')

p('## Scheduled tasks (`wireScheduler`)')
p('')
p('| Workflow | Trigger |')
p('|---|---|')
for (const w of schedulers) p(`| ${w.name} | ${(w.trigger ?? '').replace(/\|/g, '\\|')} |`)
p('')

if (queueWorkers.length || ingress.length || pikkuWorkflows.length || eventConsumers.length) {
  p('## Other system wiring')
  p('')
  p('| Workflow | Becomes |')
  p('|---|---|')
  for (const w of [...ingress, ...queueWorkers, ...eventConsumers, ...pikkuWorkflows])
    p(`| ${w.name} | \`${classifyWorkflow(w)}\` |`)
  p('')
}

p('## Journeys → scenarios')
p('')
p(`${journeys.length} user/admin journeys carrying ${scenarioCount} scenarios excavated from the`)
p('legacy test suite. These are **not** `pikkuWorkflowFunc`s — they are sequences a')
p('person drives through the UI, and they become scenario tests.')
p('')
p('| Journey | Kind | Scenarios |')
p('|---|---|---:|')
for (const w of journeys) p(`| ${w.name} | ${w.kind} | ${(w.scenarios ?? []).length} |`)
p('')

p('## Per domain')
p('')
p('| Domain | Tables | `pikkuFunc` | readonly | permissions | events | blocked |')
p('|---|---:|---:|---:|---:|---:|---:|')
for (const d of domains) {
  const n = d.name
  const b = (cmdByDomain.get(n) ?? []).filter((c) => isBlocked(c.name, n)).length +
            (qryByDomain.get(n) ?? []).filter((q) => isBlocked(q.name, n)).length
  p(
    `| ${n} | ${(entByDomain.get(n) ?? []).length} | ${(cmdByDomain.get(n) ?? []).length} | ${(qryByDomain.get(n) ?? []).length} | ${(polByDomain.get(n) ?? []).length} | ${(evtByDomain.get(n) ?? []).length} | ${b || ''} |`
  )
}
p('')

p('## Addon candidates')
p('')
p('Advisory. A capability earns an addon when it is self-contained, reused across')
p('domains, and has a clear service seam — which is what a critical/hard-to-replace')
p('integration usually is. The call is yours.')
p('')
p('| Integration | Importance | Replace |')
p('|---|---|---|')
for (const i of addonCandidates)
  p(`| ${i.name} | ${i.importance ?? ''} | ${i.replacementDifficulty ?? ''} |`)
p('')

if (feComponents.length) {
  p('## Frontend')
  p('')
  p(`- **${cheapComponents.length}** components are a cheap re-expression in Mantine (standard / composition / restyle).`)
  p(`- **${customLogic.length}** carry \`custom-logic\` and must be **ported**. This is the real frontend project.`)
  p(`- **${feRoutes.length}** routes → TanStack routes; their \`dataFrom\` names are already the function names above.`)
  p('')
  if (customLogic.length) {
    p('| custom-logic component | What must survive |')
    p('|---|---|')
    for (const c of customLogic)
      p(`| ${c.name} | ${(c.customLogic ?? '').replace(/\|/g, '\\|').slice(0, 110)} |`)
    p('')
  }
}

if (interfaces.length) {
  p('## Interfaces')
  p('')
  p('| Channel | Audience | Status |')
  p('|---|---|---|')
  for (const i of interfaces) p(`| ${i.kind} | ${i.audience ?? ''} | ${i.status ?? ''} |`)
  p('')
}

p('## Deliberately not built')
p('')
p('| Artifact | Why |')
p('|---|---|')
for (const d of dropped)
  p(`| \`${d.path ?? d.file}\` | ${(d.reason ?? '').replace(/\|/g, '\\|').slice(0, 120)} |`)
p('')

console.log(out.join('\n'))
