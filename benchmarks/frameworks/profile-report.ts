import { readFileSync } from 'node:fs'

/**
 * Reads `bun --cpu-prof` profiles (written by `run.ts profile`) and prints, per profile, the share of active CPU samples spent
 * inside each function (inclusive: a sample counts once for every distinct function name on its stack).
 *
 *   tsx benchmarks/frameworks/profile-report.ts <a.cpuprofile> [b.cpuprofile ...] [--top 40]
 *
 * "Shared work" rows are the steps both servers run through the same libraries: better-auth `getSession`
 * (`runWithEndpointContext`), the SQLite reads (kysely `executeQuery`), the cfworker `validate`. Everything else is each server's own overhead.
 */
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const topAt = process.argv.indexOf('--top')
const top = topAt === -1 ? 40 : Number(process.argv[topAt + 1])
const shared = ['runWithEndpointContext', 'executeQuery', 'validate']
const betterAuthAndSqlite = ['runWithEndpointContext', 'executeQuery']

for (const file of files) {
  const prof = JSON.parse(readFileSync(file, 'utf-8'))
  const byId = new Map<number, any>(prof.nodes.map((n: any) => [n.id, n]))
  const parent = new Map<number, number>()
  for (const n of prof.nodes)
    for (const c of n.children ?? []) parent.set(c, n.id)
  const inclusive = new Map<string, number>()
  let active = 0
  let sharedUnion = 0
  prof.samples.forEach((id: number, i: number) => {
    const dt = prof.timeDeltas[i] ?? 0
    const name0 = byId.get(id)?.callFrame.functionName
    if (name0 === '(idle)' || name0 === '(program)' || name0 === '(root)')
      return
    active += dt
    const seen = new Set<string>()
    let hit = false
    for (
      let cur: number | undefined = id;
      cur !== undefined;
      cur = parent.get(cur)
    ) {
      const f = byId.get(cur).callFrame
      const key = f.functionName || '(anonymous)'
      if (!seen.has(key)) {
        seen.add(key)
        if (betterAuthAndSqlite.includes(key)) hit = true
        inclusive.set(key, (inclusive.get(key) ?? 0) + dt)
      }
    }
    if (hit) sharedUnion += dt
  })
  console.log(`\n== ${file}  active CPU ${(active / 1e6).toFixed(2)}s`)
  for (const name of shared)
    console.log(
      `  shared ${name.padEnd(18)} ${(((inclusive.get(name) ?? 0) / active) * 100).toFixed(1)}%`
    )
  console.log(
    `  better-auth + SQLite (samples under runWithEndpointContext or executeQuery): ${((sharedUnion / active) * 100).toFixed(1)}%  = ${(sharedUnion / 1e6).toFixed(2)}s of ${(active / 1e6).toFixed(2)}s active`
  )
  console.log('  top inclusive functions:')
  for (const [name, t] of [...inclusive]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top))
    console.log(`    ${((t / active) * 100).toFixed(1).padStart(5)}%  ${name}`)
}
