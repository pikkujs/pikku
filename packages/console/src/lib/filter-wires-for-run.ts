const wireTypeToWiresKey: Record<string, string> = {
  http: 'http',
  queue: 'queue',
  scheduler: 'schedule',
  trigger: 'trigger',
  cli: 'cli',
}

const wireIdMatchers: Record<string, (wire: any) => string | undefined> = {
  http: (w) => `${w.method?.toLowerCase() || 'get'}:${w.route || ''}`,
  queue: (w) => w.name,
  schedule: (w) => w.cron || w.interval,
  trigger: (w) => w.name,
  cli: (w) => w.command,
}

/**
 * Narrows a workflow's wires down to the one that actually triggered a run, so
 * the canvas shows how this run was entered rather than every possible entry
 * point.
 *
 * TODO: the mcp branch below is unreachable. `wireTypeToWiresKey` has no 'mcp'
 * entry, so `if (!wiresKey) return {}` returns first and an MCP-triggered run
 * renders with no wires at all. Adding `mcp: 'mcp'` to the map looks like the
 * fix, but it changes what the canvas draws, so it belongs in its own change
 * with its own issue rather than riding along with a refactor. The current
 * behaviour is pinned in filter-wires-for-run.test.ts.
 */
export function filterWiresForRun(
  wires: any,
  runWire: { type: string; id?: string }
): any {
  const wiresKey = wireTypeToWiresKey[runWire.type]
  if (!wiresKey) return {}

  if (wiresKey === 'mcp' || runWire.type === 'mcp') {
    if (!wires.mcp || !runWire.id) return { mcp: wires.mcp }
    const [subType, ...rest] = runWire.id.split(':')
    const matchId = rest.join(':')
    const filtered: any = {}
    if (wires.mcp[subType]) {
      filtered[subType] = wires.mcp[subType].filter(
        (w: any) => (w.name || w.uri) === matchId
      )
    }
    return { mcp: filtered }
  }

  const entries = wires[wiresKey]
  if (!entries) return {}

  if (!runWire.id) return { [wiresKey]: entries }

  const matcher = wireIdMatchers[wiresKey]
  if (!matcher) return { [wiresKey]: entries }

  return { [wiresKey]: entries.filter((w: any) => matcher(w) === runWire.id) }
}
