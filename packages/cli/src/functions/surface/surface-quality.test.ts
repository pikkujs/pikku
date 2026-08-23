import assert from 'node:assert'
import { describe, test } from 'node:test'

import { readShippedSurfaceDoc } from './shipped-surface-doc.js'
import type { SurfaceDoc, SurfaceDocSymbol } from './surface-doc.types.js'

const doc: SurfaceDoc | null = readShippedSurfaceDoc()

const BUILTIN = new Set(
  `string number boolean void unknown any never null undefined object symbol bigint true false
   Promise Record Partial Pick Omit Array ReadonlyArray Readonly Required Exclude Extract Map Set
   Date Error RegExp Function Awaited ReturnType Parameters Buffer URL Uint8Array Iterable Response
   AsyncIterable JSON Math NonNullable InstanceType Symbol Object Number String Boolean Iterator
   ArrayBuffer WeakMap AbortSignal`.split(/\s+/)
)

const NAME = /\b[A-Z][A-Za-z0-9_]*\b/g

const typeParameters = (signature: string | undefined): string[] => {
  if (!signature) return []
  const open = signature.indexOf('<')
  if (open < 0) return []
  let depth = 0
  let end = open
  for (; end < signature.length; end++) {
    if (signature[end] === '<') depth++
    else if (signature[end] === '>' && --depth === 0) break
  }
  return signature
    .slice(open + 1, end)
    .split(/,(?![^<]*>)/)
    .map((parameter) => parameter.trim().split(' ')[0]!)
    .filter(Boolean)
}

const typed = (symbol: SurfaceDocSymbol): string[] => [
  symbol.signature ?? '',
  ...(symbol.members ?? []).map((member) => member.line),
]

const read = () => {
  assert.ok(doc, 'no shipped surface.json — build the CLI first')
  const symbols = doc.entryPoints.flatMap((entryPoint) =>
    entryPoint.leaves.flatMap((leaf) => leaf.symbols)
  )
  const resolvable = new Set([
    ...symbols.map((symbol) => symbol.name),
    ...symbols.flatMap((symbol) => typeParameters(symbol.signature)),
  ])
  return { symbols, resolvable }
}

/**
 * Ceilings, not targets. Each one is what the surface measured when the gate
 * went in; the assertion is `<=`, so a change that makes the doc worse fails
 * and a change that makes it better is expected to lower the number here.
 */
const CORE_LEAK = 112
const UNRESOLVABLE = 818
const BARE_ERRORS = 5

/** A floor rather than a ceiling: the assertion is `>=`. */
const DOCUMENTED_KEYS = 76

describe('the shipped surface doc', { skip: doc ? false : 'not built' }, () => {
  test('does not name the internals the generated aliases exist to hide', () => {
    const { symbols } = read()
    const leaked = symbols.flatMap((symbol) =>
      typed(symbol)
        .flatMap((line) => line.match(NAME) ?? [])
        .filter((name) => name.startsWith('Core'))
        .map((name) => `${symbol.name}: ${name}`)
    )
    assert.ok(
      leaked.length <= CORE_LEAK,
      `${leaked.length} references to a Core* internal, up from ${CORE_LEAK}. A reader ` +
        `cannot resolve one: it is the pre-generation shape, and the generated alias over ` +
        `it is what they import. Point the codegen at the alias:\n  ` +
        `${[...new Set(leaked)].sort().join('\n  ')}`
    )
  })

  test('resolves the types it names, or is measurably closer to it', () => {
    const { symbols, resolvable } = read()
    const missing = new Set<string>()
    let occurrences = 0
    for (const symbol of symbols) {
      for (const line of typed(symbol)) {
        for (const name of line.match(NAME) ?? []) {
          if (BUILTIN.has(name) || resolvable.has(name)) continue
          missing.add(name)
          occurrences++
        }
      }
    }
    assert.ok(
      occurrences <= UNRESOLVABLE,
      `${occurrences} references to a type the doc never describes, up from ${UNRESOLVABLE}. ` +
        `Closure is the whole promise of the doc: every type it names is a type it can ` +
        `explain. Export the type through a leaf, or inline the shape:\n  ` +
        `${[...missing].sort().join(', ')}`
    )
  })

  test('gives every error class the status it is registered with', () => {
    const { symbols } = read()
    const errors = symbols.filter(
      (symbol) => symbol.kind === 'class' && symbol.name.endsWith('Error')
    )
    const bare = errors
      .filter((symbol) => symbol.status === undefined)
      .map((symbol) => symbol.name)
    assert.ok(
      errors.length > 0 && bare.length <= BARE_ERRORS,
      `${bare.length} of ${errors.length} error classes carry no status, up from ` +
        `${BARE_ERRORS}. The status is the one thing a caller needs from an error ` +
        `class, and it only exists in the emitted \`.js\` — a declaration file has ` +
        `no statements, so a scrape that reads only the program finds nothing:\n  ` +
        `${bare.join(', ')}`
    )
  })

  test('says what each key it lists is for', () => {
    const { symbols } = read()
    const keys = symbols.flatMap((symbol) => symbol.members ?? [])
    const documented = keys.filter((key) => key.doc).length
    const percent = Math.round((documented / keys.length) * 100)
    assert.ok(
      percent >= DOCUMENTED_KEYS,
      `${documented} of ${keys.length} keys (${percent}%) say what they are for, ` +
        `down from ${DOCUMENTED_KEYS}%. A key printed as a name and a type is a shape; ` +
        `what a caller needs is what to put in it, and only the JSDoc where the type ` +
        `is declared has that. Write it there and it reaches this doc, the IDE and the ` +
        `console at once:\n  ` +
        `${symbols
          .filter((symbol) => (symbol.members ?? []).some((key) => !key.doc))
          .map(
            (symbol) =>
              `${symbol.name}: ${(symbol.members ?? [])
                .filter((key) => !key.doc)
                .map((key) => key.line.split(/[?:]/)[0])
                .join(' ')}`
          )
          .sort()
          .join('\n  ')}`
    )
  })
})
