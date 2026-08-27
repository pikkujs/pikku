import type { PanelType } from '../context/PanelContext'

/**
 * How a selected row is written into the URL fragment, and read back out.
 *
 * A surface showing one kind of thing writes the bare id — `/functions#myFunc`,
 * `/apis?tab=channels#events`. A surface showing several writes the type too —
 * `/jobs?tab=triggers#trigger:orderPlaced` — because the id alone would not say
 * which list owns it. Writer and reader apply the same rule (see
 * `panelHashIsBare`), so a fragment always round-trips.
 */
export const PANEL_URL_SLUGS: Partial<Record<PanelType, string>> = {
  function: 'function',
  http: 'http',
  channel: 'channel',
  rpc: 'rpc',
  scheduler: 'scheduler',
  queue: 'queue',
  cli: 'cli',
  mcp: 'mcp',
  gateway: 'gateway',
  workflow: 'workflow',
  trigger: 'trigger',
  triggerSource: 'triggerSource',
  middleware: 'middleware',
  permission: 'permission',
  agent: 'agent',
  secret: 'secret',
  variable: 'variable',
  credentialUser: 'user',
  email: 'email',
  persona: 'persona',
}

const SLUG_TO_TYPE = new Map<string, PanelType>(
  Object.entries(PANEL_URL_SLUGS).map(([type, slug]) => [
    slug!,
    type as PanelType,
  ])
)

/**
 * Where a panel of each type can be opened, for links that cross pages. Types
 * that are only reachable from inside another surface — a workflow step, a
 * database column — have no entry, and no link is offered for them.
 */
const PANEL_URL_PATHS: Partial<Record<PanelType, string>> = {
  function: '/functions',
  http: '/apis?tab=http',
  channel: '/apis?tab=channels',
  mcp: '/apis?tab=mcp',
  cli: '/apis?tab=cli',
  gateway: '/apis?tab=gateways',
  scheduler: '/jobs?tab=schedulers',
  queue: '/jobs?tab=queues',
  trigger: '/jobs?tab=triggers',
  triggerSource: '/jobs?tab=triggers',
  middleware: '/runtime?tab=middleware',
  permission: '/runtime?tab=permissions',
  workflow: '/workflow',
  agent: '/agents',
  secret: '/secrets',
  variable: '/variables',
  credentialUser: '/credentials?tab=users',
  email: '/emails',
  persona: '/personas',
}

/** `:` and `/` are legal in a fragment and read far better left alone. */
const encodeId = (id: string) =>
  encodeURIComponent(id).replace(/%3A/gi, ':').replace(/%2F/gi, '/')

const decodeId = (id: string) => {
  try {
    return decodeURIComponent(id)
  } catch {
    return id
  }
}

/** A single `:` separates a type from an id; the `::` inside a wire id is not one. */
const splitTypePrefix = (hash: string): [PanelType, string] | null => {
  const match = /^([A-Za-z]+):(?!:)(.+)$/.exec(hash)
  if (!match) return null
  const type = SLUG_TO_TYPE.get(match[1]!)
  return type ? [type, match[2]!] : null
}

export const panelHashIsBare = (registeredTypes: Set<PanelType>) =>
  registeredTypes.size === 1

export const encodePanelHash = (
  type: PanelType,
  id: string,
  bare: boolean
): string | null => {
  const slug = PANEL_URL_SLUGS[type]
  if (!slug) return null
  return bare ? encodeId(id) : `${slug}:${encodeId(id)}`
}

/**
 * The type and id a fragment names, or a bare id with no type when the surface
 * it was written on had only one list to attribute it to.
 */
export const decodePanelHash = (
  hash: string
): { type: PanelType | null; id: string } | null => {
  if (!hash) return null
  const prefixed = splitTypePrefix(hash)
  if (prefixed) return { type: prefixed[0], id: decodeId(prefixed[1]) }
  return { type: null, id: decodeId(hash) }
}

/** A link that opens `id` on the page that owns its type, or null if none does. */
export const panelHref = (type: PanelType, id: string): string | null => {
  const path = PANEL_URL_PATHS[type]
  const hash = encodePanelHash(type, id, false)
  return path && hash ? `${path}#${hash}` : null
}
