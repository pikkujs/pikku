import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { discoverFunctions } from './discover.ts'

const root = resolve(process.argv[2] ?? '.')
const projects: string[] = []
const walk = (dir: string, depth: number) => {
  if (depth > 4) return
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (!statSync(p).isDirectory()) continue
    if (
      existsSync(join(p, 'pikku.config.json')) &&
      existsSync(join(p, 'tsconfig.json'))
    )
      projects.push(p)
    walk(p, depth + 1)
  }
}
walk(root, 0)

let ok = 0
let failed = 0
let functions = 0
const started = performance.now()
for (const p of projects) {
  const t = performance.now()
  try {
    const r = discoverFunctions(p)
    ok++
    functions += r.functions.length
    console.log(
      `ok     ${String(r.functions.length).padStart(3)} fn  ${(performance.now() - t).toFixed(0).padStart(5)}ms  ${p.replace(root + '/', '')}`
    )
  } catch (e) {
    failed++
    console.log(
      `FAIL         ${p.replace(root + '/', '')}: ${String((e as Error).message)
        .split('\n')[0]!
        .slice(0, 120)}`
    )
  }
}
console.log(
  `\n${projects.length} projects: ${ok} ok, ${failed} failed, ${functions} functions, ${((performance.now() - started) / 1000).toFixed(1)}s total`
)
