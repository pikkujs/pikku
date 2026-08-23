import type {
  SurfaceDoc,
  SurfaceDocSymbol,
  SurfaceEntryPointId,
  SurfaceLeaf,
} from './surface-doc.types.js'

export type RenderSurfaceDocOptions = {
  target?: string
  ai?: boolean
  entryPoint?: SurfaceEntryPointId
}

export class UnknownSurfaceTargetError extends Error {
  constructor(
    public readonly target: string,
    public readonly suggestions: string[]
  ) {
    super(
      suggestions.length > 0
        ? `No door or export called '${target}'. Did you mean: ${suggestions.join(', ')}?`
        : `No door or export called '${target}'. Run 'pikku doc' for the index.`
    )
  }
}

const STEPS = [
  'create a function',
  'enhance it',
  'wire it up',
  'guard it',
  'orchestrate it',
  'test it',
] as const

const wrap = (text: string, width: number, indent: string): string =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .reduce<string[]>((lines, word) => {
      const last = lines[lines.length - 1]
      if (last !== undefined && `${last} ${word}`.length <= width) {
        lines[lines.length - 1] = `${last} ${word}`
      } else {
        lines.push(word)
      }
      return lines
    }, [])
    .map((line) => indent + line)
    .join('\n')

const columns = (values: string[], perRow: number, width: number): string[] => {
  const rows: string[] = []
  for (let i = 0; i < values.length; i += perRow) {
    rows.push(
      '    ' +
        values
          .slice(i, i + perRow)
          .map((value) =>
            value.length >= width ? `${value}  ` : value.padEnd(width)
          )
          .join('')
          .trimEnd()
    )
  }
  return rows
}

const appEntryPoint = (doc: SurfaceDoc, id: SurfaceEntryPointId) => {
  const entryPoint = doc.entryPoints.find((candidate) => candidate.id === id)
  if (!entryPoint) {
    throw new Error(`The surface doc has no '${id}' entry point.`)
  }
  return entryPoint
}

const renderIndex = (doc: SurfaceDoc, leaves: SurfaceLeaf[], ai: boolean) => {
  const total = leaves.reduce((count, leaf) => count + leaf.symbols.length, 0)
  const lines = [
    `pikku ${doc.version} — application surface, ${leaves.length} doors / ${total} exports`,
    '',
  ]
  for (const step of STEPS) {
    const names = leaves
      .filter((leaf) => leaf.step === step)
      .map((leaf) => leaf.name)
    if (names.length > 0) {
      lines.push(`  ${step.padEnd(20)}${names.join('  ')}`)
    }
  }
  const fn = leaves.find((leaf) => leaf.name === 'function')
  if (fn) {
    lines.push('', `  ${fn.specifier} — every wiring eventually points at one of these`)
    lines.push(...columns(fn.symbols.map((symbol) => symbol.name), 4, 26))
  }
  if (ai) {
    const taught = leaves.filter((leaf) => leaf.skill)
    const bare = leaves.filter((leaf) => !leaf.skill).map((leaf) => leaf.name)
    lines.push('', '  what is above is what exists; these skills say how to use it')
    lines.push(
      ...columns(
        taught.map((leaf) => `${leaf.name} → ${[leaf.skill].flat().join(' + ')}`),
        2,
        38
      )
    )
    if (bare.length > 0) {
      lines.push(
        wrap(
          `No skill teaches ${bare.join(', ')} — for those, this doc is the whole of it.`,
          78,
          '  '
        )
      )
    }
  }
  lines.push(
    '',
    '  pikku doc <door>      one door: what it exports and the keys you write',
    '  pikku doc <export>    one export: its signature, its keys, what it references',
    '  pikku doc a b c       several at once, in one call'
  )
  if (!ai) {
    lines.push('  pikku doc --ai        the same, plus the skill to load for each door')
  }
  return lines.join('\n')
}

const renderSymbolRow = (symbol: SurfaceDocSymbol): string[] => {
  const lines = [
    `  ${symbol.name}${symbol.deprecated ? '  [deprecated]' : ''}  (${symbol.kind})`,
  ]
  if (symbol.summary) {
    lines.push(wrap(symbol.summary, 74, '      '))
  }
  const keys = symbol.members?.length ?? 0
  const more = keys > 0 || (symbol.examples?.length ?? 0) > 0
  const signature = symbol.signature?.replace(/\s+/g, ' ')
  if (more) {
    lines.push(
      `      ${keys > 0 ? `${keys} keys` : 'example'} — pikku doc ${symbol.name}`
    )
  } else if (signature && signature.length <= 96) {
    lines.push(`      ${signature}`)
  } else if (signature) {
    lines.push(`      pikku doc ${symbol.name}`)
  }
  lines.push('')
  return lines
}

const renderLeaf = (leaf: SurfaceLeaf, ai: boolean): string => {
  const lines = [`${leaf.specifier} — ${leaf.step}`, '', wrap(leaf.summary, 78, '  '), '']
  const statuses = leaf.symbols.filter((symbol) => symbol.status !== undefined)
  for (const symbol of leaf.symbols.filter((symbol) => symbol.status === undefined)) {
    lines.push(...renderSymbolRow(symbol))
  }
  if (statuses.length > 0) {
    lines.push(`  ${statuses.length} error classes, each thrown to produce its HTTP status:`)
    lines.push(
      ...columns(
        statuses.map((symbol) => `${symbol.name} ${symbol.status}`),
        3,
        38
      )
    )
    lines.push('')
  }
  if (ai) {
    lines.push(
      leaf.skill
        ? `  Load the ${[leaf.skill].flat().join(' and ')} skill before writing this if you need how rather than what.`
        : '  No skill teaches this door — what is above is the whole of it.'
    )
  }
  return lines.join('\n')
}

const referencesOf = (
  symbol: SurfaceDocSymbol,
  home: Map<string, string>
): string[] => {
  const blob = [
    symbol.signature ?? '',
    ...(symbol.members ?? []).map((member) => member.line),
  ].join(' ')
  return [...new Set(blob.match(/\b[A-Z][A-Za-z0-9]+\b/g) ?? [])].filter(
    (name) => home.has(name) && name !== symbol.name
  )
}

const renderSymbol = (
  symbol: SurfaceDocSymbol,
  leaf: SurfaceLeaf,
  home: Map<string, string>,
  ai: boolean
): string => {
  const lines = [`${symbol.name} — ${symbol.kind}, from ${leaf.specifier}`, '']
  if (symbol.deprecated) {
    lines.push(`  DEPRECATED: ${symbol.deprecated}`, '')
  }
  if (symbol.docs) {
    lines.push(wrap(symbol.docs, 78, '  '), '')
  }
  if (symbol.status !== undefined) {
    lines.push(`  HTTP status ${symbol.status}`, '')
  }
  if (symbol.signature) {
    lines.push('  ' + symbol.signature.replace(/\s+/g, ' '), '')
  }
  if (symbol.members?.length) {
    lines.push('  keys you write')
    for (const member of symbol.members) {
      lines.push(`    ${member.line}`)
      if (member.doc) {
        lines.push(wrap(member.doc, 72, '        '))
      }
    }
    lines.push('')
  }
  for (const example of symbol.examples ?? []) {
    lines.push('  example')
    lines.push(...example.split('\n').map((line) => '    ' + line))
    lines.push('')
  }
  const references = referencesOf(symbol, home)
  if (references.length > 0) {
    lines.push(
      '  references  ' +
        references.map((name) => `${name} (${home.get(name)})`).join('  ')
    )
  }
  if (ai && leaf.skill) {
    lines.push('', `  Load the ${[leaf.skill].flat().join(' and ')} skill before writing this if you need how rather than what.`)
  }
  return lines.join('\n').trimEnd()
}

const near = (target: string, candidates: string[]): string[] => {
  const needle = target.toLowerCase()
  return candidates
    .filter((candidate) => candidate.toLowerCase().includes(needle))
    .slice(0, 5)
}

export const renderSurfaceDoc = (
  doc: SurfaceDoc,
  { target, ai = false, entryPoint = 'app' }: RenderSurfaceDocOptions = {}
): string => {
  const leaves = appEntryPoint(doc, entryPoint).leaves
  if (!target) {
    return renderIndex(doc, leaves, ai)
  }
  const leaf = leaves.find(
    (candidate) =>
      candidate.name === target || candidate.specifier === target
  )
  if (leaf) {
    return renderLeaf(leaf, ai)
  }
  const home = new Map<string, string>()
  for (const candidate of leaves) {
    for (const symbol of candidate.symbols) {
      if (!home.has(symbol.name)) {
        home.set(symbol.name, candidate.specifier)
      }
    }
  }
  const owner = leaves.find((candidate) =>
    candidate.symbols.some((symbol) => symbol.name === target)
  )
  const symbol = owner?.symbols.find((candidate) => candidate.name === target)
  if (owner && symbol) {
    return renderSymbol(symbol, owner, home, ai)
  }
  const elsewhere = doc.entryPoints.find(
    (candidate) =>
      candidate.id !== entryPoint &&
      candidate.leaves.some((leaf2) =>
        leaf2.symbols.some((symbol2) => symbol2.name === target)
      )
  )
  if (elsewhere) {
    return renderSurfaceDoc(doc, { target, ai, entryPoint: elsewhere.id })
  }
  throw new UnknownSurfaceTargetError(
    target,
    near(target, [...leaves.map((candidate) => candidate.name), ...home.keys()])
  )
}
