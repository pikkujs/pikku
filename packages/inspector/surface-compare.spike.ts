/**
 * Runs both surface collectors over one package and diffs them.
 *   bun run surface-compare.ts <packageDir>
 */
import { collectSurface } from './src/surface/collect-surface.ts'
import { collectSurfaceTs7 } from './src/surface/collect-surface-ts7.ts'

const dir = process.argv[2]!

const time = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const started = performance.now()
  const result = await fn()
  console.log(`${label}: ${Math.round(performance.now() - started)}ms`)
  return result
}

const main = async () => {
  const six = await time('ts6 ', () => collectSurface(dir))
  const seven = await time('ts7 ', () => collectSurfaceTs7(dir))

  const index = (entrypoints: typeof six) =>
    new Map(
      entrypoints.flatMap((entry) =>
        entry.symbols.map((s) => [`${entry.subpath} ${s.name}`, s] as const)
      )
    )

  const a = index(six)
  const b = index(seven)

  console.log(`\nsymbols: ts6 ${a.size}, ts7 ${b.size}`)

  const missing = [...a.keys()].filter((k) => !b.has(k))
  const extra = [...b.keys()].filter((k) => !a.has(k))
  if (missing.length) console.log(`only in ts6 (${missing.length}):`, missing.slice(0, 15))
  if (extra.length) console.log(`only in ts7 (${extra.length}):`, extra.slice(0, 15))

  const quotes = (v: string) => v.replace(/"/g, "'")
  const unions = (v: string) =>
    quotes(v).replace(/[^ ()<>{},;:]+(?: \| [^ ()<>{},;:]+)+/g, (run) =>
      run.split(' | ').sort().join(' | ')
    )
  const links = (v: string) => v.replace(/\{@link ([^}]+)\}/g, '$1')
  const classified = { linkOnly: 0, quoteOnly: 0, unionOnly: 0, real: 0 }
  const real: string[] = []

  const fields = ['kind', 'declaredAt', 'summary', 'signature'] as const
  const diffs: Record<string, number> = {}
  const samples: string[] = []
  for (const [key, left] of a) {
    const right = b.get(key)
    if (!right) continue
    for (const field of fields) {
      if ((left[field] ?? null) !== (right[field] ?? null)) {
        diffs[field] = (diffs[field] ?? 0) + 1
        const l = String(left[field] ?? '')
        const r = String(right[field] ?? '')
        if (links(l) === links(r)) classified.linkOnly++
        else if (quotes(l) === quotes(r)) classified.quoteOnly++
        else if (unions(l) === unions(r)) classified.unionOnly++
        else {
          classified.real++
          real.push(
            `${key} .${field}\n   6: ${l.slice(0, 200)}\n   7: ${r.slice(0, 200)}`
          )
        }
        if (samples.length < 8)
          samples.push(
            `${key} .${field}\n   6: ${String(left[field]).slice(0, 160)}\n   7: ${String(right[field]).slice(0, 160)}`
          )
      }
    }
    const lm = (left.members ?? []).map((m) => m.line).join('\n')
    const rm = (right.members ?? []).map((m) => m.line).join('\n')
    if (lm !== rm) {
      diffs.members = (diffs.members ?? 0) + 1
      if (samples.length < 12)
        samples.push(`${key} .members\n   6: ${lm.slice(0, 200)}\n   7: ${rm.slice(0, 200)}`)
    }
  }
  console.log('field diffs:', diffs)
  console.log('classified:', classified)
  if (real.length) console.log('\nreal differences:\n' + real.join('\n'))
  if (samples.length) console.log('\n' + samples.join('\n'))
}

main()
