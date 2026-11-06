import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { discoverFunctions, type DiscoveredFunction } from './discover.ts'

type GoFunction = Record<string, any>

const FIELDS: {
  key: keyof DiscoveredFunction
  go: (g: GoFunction) => unknown
}[] = [
  { key: 'pikkuFuncId', go: (g) => g.pikkuFuncId },
  { key: 'funcWrapper', go: (g) => g.funcWrapper },
  { key: 'sessionless', go: (g) => g.sessionless },
  { key: 'isDirectFunction', go: (g) => g.isDirectFunction },
  { key: 'services', go: (g) => g.services?.services ?? [] },
  { key: 'inputs', go: (g) => g.inputs ?? [] },
  { key: 'outputs', go: (g) => g.outputs ?? [] },
  { key: 'description', go: (g) => g.description },
  { key: 'title', go: (g) => g.title },
  { key: 'tags', go: (g) => g.tags },
  { key: 'mcp', go: (g) => g.mcp },
  { key: 'expose', go: (g) => g.expose },
  { key: 'auth', go: (g) => g.auth },
]

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

type GoRoute = Record<string, any>

const ROUTE_FIELDS: {
  key: string
  go: (g: GoRoute) => unknown
  ours: (r: any) => unknown
}[] = [
  { key: 'pikkuFuncId', go: (g) => g.pikkuFuncId, ours: (r) => r.pikkuFuncId },
  { key: 'auth', go: (g) => g.auth, ours: (r) => r.auth },
  { key: 'params', go: (g) => g.params ?? [], ours: (r) => r.params },
  { key: 'tags', go: (g) => g.tags, ours: (r) => r.tags },
]

export const scoreRoutes = (
  projectDir: string,
  found: ReturnType<typeof discoverFunctions>,
  verbose = 3
) => {
  const metaPath = join(
    projectDir,
    '.pikku/http/pikku-http-wirings-meta.gen.json'
  )
  const table: Record<string, Record<string, GoRoute>> = JSON.parse(
    readFileSync(metaPath, 'utf8')
  )
  const goRoutes: GoRoute[] = Object.values(table).flatMap((byRoute) =>
    Object.values(byRoute)
  )
  // routes declared in this project's own sources: the console/auth scaffolds the CLI writes are in src/ too
  const goOwn = goRoutes.filter((g) =>
    g.sourceFile.startsWith(join(projectDir, 'src') + '/')
  )
  const k = (r: { method: string; route: string }) => `${r.method} ${r.route}`
  const ours = new Map(found.routes.map((r) => [k(r), r]))
  const matched = goOwn.filter((g) => ours.has(k(g)))
  const missing = goOwn.filter((g) => !ours.has(k(g)))
  const goKeys = new Set(goOwn.map(k))
  const extra = found.routes.filter((r) => !goKeys.has(k(r)))
  const fields = ROUTE_FIELDS.map(({ key, go, ours: mine }) => {
    let ok = 0
    const bad: string[] = []
    for (const g of matched) {
      const r = ours.get(k(g))
      if (same(mine(r), go(g))) ok++
      else if (bad.length < verbose)
        bad.push(
          `${k(g)}: go=${JSON.stringify(go(g))} tsrs=${JSON.stringify(mine(r))}`
        )
    }
    return { field: key, ok, total: matched.length, bad }
  })
  return {
    goTotal: goOwn.length,
    matched: matched.length,
    missing,
    extra,
    fields,
  }
}

export const score = (projectDir: string, verbose = 3) => {
  const metaPath = join(
    projectDir,
    '.pikku/function/pikku-functions-meta-verbose.gen.json'
  )
  const goAll: GoFunction[] = Object.values(
    JSON.parse(readFileSync(metaPath, 'utf8'))
  )
  const goOwn = goAll.filter((g) =>
    g.sourceFile.startsWith(join(projectDir, 'src') + '/')
  )
  const found = discoverFunctions(projectDir)
  const key = (f: { exportedName: string; sourceFile: string }) =>
    `${f.sourceFile}#${f.exportedName}`
  const ours = new Map(found.functions.map((f) => [key(f), f]))
  const goKeys = new Set(goOwn.map(key))

  const missing = goOwn.filter((g) => !ours.has(key(g)))
  const extra = found.functions.filter((f) => !goKeys.has(key(f)))
  const matched = goOwn.filter((g) => ours.has(key(g)))

  const fieldScores = FIELDS.map(({ key: field, go }) => {
    let ok = 0
    const bad: string[] = []
    for (const g of matched) {
      const mine = ours.get(key(g))!
      if (same(mine[field], go(g))) ok++
      else if (bad.length < verbose)
        bad.push(
          `${g.exportedName}: go=${JSON.stringify(go(g))} tsrs=${JSON.stringify(mine[field])}`
        )
    }
    return { field, ok, total: matched.length, bad }
  })
  return {
    projectDir,
    goTotal: goOwn.length,
    found,
    matched: matched.length,
    missing,
    extra,
    fieldScores,
    routes: scoreRoutes(projectDir, found),
  }
}

if (process.argv[1]?.endsWith('score.ts')) {
  const dirs = process.argv.slice(2).map((d) => resolve(d))
  let allOk = 0
  let allTotal = 0
  let fnOk = 0
  let fnTotal = 0
  let fnFound = 0
  let fnGo = 0
  let rtOk = 0
  let rtTotal = 0
  let rtFound = 0
  let rtGo = 0
  for (const dir of dirs) {
    const r = score(dir)
    console.log(`\n== ${dir.split('/').slice(-2).join('/')}`)
    console.log(
      `functions: go=${r.goTotal} tsrs=${r.found.functions.length} matched=${r.matched} missing=${r.missing.length} extra=${r.extra.length}  (open ${r.found.openMs.toFixed(0)}ms, walk ${r.found.walkMs.toFixed(0)}ms, ${r.found.filesRead} files)`
    )
    for (const m of r.missing.slice(0, 4))
      console.log(
        `  missing: ${m.exportedName} (${m.funcWrapper}) in ${m.sourceFile.split('/src/')[1]}`
      )
    fnFound += r.matched
    fnGo += r.goTotal
    for (const f of r.fieldScores) {
      allOk += f.ok
      allTotal += f.total
      fnOk += f.ok
      fnTotal += f.total
      console.log(
        `  ${f.field.padEnd(17)} ${String(f.ok).padStart(3)}/${f.total}`
      )
      for (const b of f.bad) console.log(`      ${b}`)
    }
    const rt = r.routes
    console.log(
      `  -- http routes: go=${rt.goTotal} matched=${rt.matched} missing=${rt.missing.length} extra=${rt.extra.length}  (resolve+walk ${r.found.routesMs.toFixed(0)}ms)`
    )
    for (const m of rt.missing.slice(0, 3))
      console.log(
        `      missing: ${m.method} ${m.route} -> ${m.pikkuFuncId} in ${m.sourceFile.split('/src/')[1]}`
      )
    rtFound += rt.matched
    rtGo += rt.goTotal
    for (const f of rt.fields) {
      allOk += f.ok
      allTotal += f.total
      rtOk += f.ok
      rtTotal += f.total
      console.log(
        `  ${('route.' + f.field).padEnd(17)} ${String(f.ok).padStart(3)}/${f.total}`
      )
      for (const b of f.bad) console.log(`      ${b}`)
    }
  }
  const pct = (a: number, b: number) => ((100 * a) / b).toFixed(1)
  console.log(
    `\nfunctions: found ${fnFound}/${fnGo}, fields ${fnOk}/${fnTotal} = ${pct(fnOk, fnTotal)}%`
  )
  console.log(
    `routes:    found ${rtFound}/${rtGo}, fields ${rtOk}/${rtTotal} = ${pct(rtOk, rtTotal)}%`
  )
  console.log(
    `field-level agreement: ${allOk}/${allTotal} = ${((100 * allOk) / allTotal).toFixed(1)}%`
  )
}
