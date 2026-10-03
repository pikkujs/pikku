import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ArrowLeftRight,
  Braces,
  Clock,
  Globe,
  Mail,
  Package,
  RadioTower,
  Route as RouteIcon,
  Sparkles,
  Terminal,
  Webhook,
  Workflow as WorkflowIcon,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { m } from '@/i18n/messages'
import type { WeaveType, WeavePiece } from './types'

/* how long a freshly-woven piece stays lit before fading back to rest */
export const HOT_MS = 5000

export const GOLD = 2.399963229728653

export type TypeInfo = { label: () => string; icon: LucideIcon; color: string }

export const TYPES: Record<WeaveType, TypeInfo> = {
  function: { label: () => m.weaving_type_function(), icon: Braces, color: 'var(--app-violet)' },
  // API route: request → response, so a two-way arrow rather than the browser globe.
  http: { label: () => m.weaving_type_http(), icon: ArrowLeftRight, color: 'var(--app-green)' },
  // A frontend page the user opens in the browser — the web/browser globe.
  page: { label: () => m.weaving_type_page(), icon: Globe, color: 'var(--app-blue)' },
  channel: { label: () => m.weaving_type_channel(), icon: RadioTower, color: 'var(--app-accent)' },
  queue: {
    label: () => m.weaving_type_queue(),
    icon: Zap,
    color: 'color-mix(in srgb, var(--app-green) 55%, var(--app-accent))',
  },
  scheduler: { label: () => m.weaving_type_scheduler(), icon: Clock, color: 'var(--app-amber)' },
  mcp: {
    label: () => m.weaving_type_mcp(),
    icon: Wrench,
    color: 'color-mix(in srgb, var(--app-violet) 55%, var(--app-accent))',
  },
  workflow: {
    label: () => m.weaving_type_workflow(),
    icon: WorkflowIcon,
    color: 'var(--app-accent)',
  },
  // A user-journey story that drives the app's RPCs — a traced route through it.
  scenario: {
    label: () => m.weaving_type_scenario(),
    icon: RouteIcon,
    color: 'color-mix(in srgb, var(--app-green) 60%, var(--app-blue))',
  },
  agent: { label: () => m.weaving_type_agent(), icon: Sparkles, color: 'var(--app-violet)' },
  email: { label: () => m.weaving_type_email(), icon: Mail, color: 'var(--app-red)' },
  cli: { label: () => m.weaving_type_cli(), icon: Terminal, color: 'var(--app-text-dim)' },
  trigger: {
    label: () => m.weaving_type_trigger(),
    icon: Webhook,
    color: 'color-mix(in srgb, var(--app-amber) 60%, var(--app-red))',
  },
  // An installed @pikku/addon-* package — a pre-woven bundle of functions/wires
  // the app pulls in, rather than something the builder stitched by hand.
  addon: {
    label: () => m.weaving_type_addon(),
    icon: Package,
    color: 'color-mix(in srgb, var(--app-blue) 55%, var(--app-violet))',
  },
}

export const surfOf = (color: string) => `color-mix(in srgb, ${color} 9%, var(--app-panel-bg))`

export const bdOf = (color: string) => `color-mix(in srgb, ${color} 32%, var(--app-border))`

/* ---- flatten the live pikku meta into an ordered list of woven pieces ---- */
export type MetaShape = ReturnType<typeof usePikkuMeta>['meta']

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function tagsSayBuiltIn(tags: unknown): boolean {
  return (
    Array.isArray(tags) &&
    tags.some((t) => t === 'pikku' || (typeof t === 'string' && t.startsWith('pikku:')))
  )
}

export function sourceSaysBuiltIn(sourceFile: unknown): boolean {
  return (
    typeof sourceFile === 'string' &&
    (sourceFile.includes('/scaffold/') ||
      sourceFile.includes('/node_modules/') ||
      /\.gen\.[cm]?tsx?$/.test(sourceFile))
  )
}

export function itemIsBuiltIn(item: Record<string, unknown>, builtinFuncIds: Set<string>): boolean {
  if (tagsSayBuiltIn(item.tags)) return true
  if (item.packageName) return true
  if (sourceSaysBuiltIn(item.sourceFile)) return true
  const fid = item.pikkuFuncId
  return typeof fid === 'string' && builtinFuncIds.has(fid)
}

export function flattenMeta(meta: MetaShape): WeavePiece[] {
  // First pass: which functions are scaffold/pikku built-ins. Wire pieces then
  // inherit built-in-ness from the function they call (via pikkuFuncId).
  const builtinFuncIds = new Set<string>()
  for (const raw of (meta.functions as unknown[] | undefined) ?? []) {
    const fn = asRecord(raw)
    if (tagsSayBuiltIn(fn.tags) || fn.packageName || sourceSaysBuiltIn(fn.sourceFile)) {
      const fid = fn.pikkuFuncId ?? fn.name
      if (typeof fid === 'string') builtinFuncIds.add(fid)
    }
  }

  const out: WeavePiece[] = []
  const arr = (items: unknown, type: WeaveType, id: (i: Record<string, unknown>) => string) => {
    for (const raw of (items as unknown[] | undefined) ?? []) {
      const item = asRecord(raw)
      if (itemIsBuiltIn(item, builtinFuncIds)) continue
      const name = id(item)
      if (name) out.push({ id: `${type}:${name}`, type, name, meta: item })
    }
  }
  const rec = (
    record: unknown,
    type: WeaveType,
    name?: (v: Record<string, unknown>, k: string) => string,
  ) => {
    for (const [key, value] of Object.entries(asRecord(record))) {
      const item = asRecord(value)
      if (itemIsBuiltIn(item, builtinFuncIds)) continue
      const label = name ? name(item, key) : key
      if (label) out.push({ id: `${type}:${key}`, type, name: label, meta: item })
    }
  }

  // Data + logic first, then transports, comms, automations, tooling — mirrors
  // the order a build actually lands things, so the spiral reads outward-in-time.
  arr(meta.functions, 'function', (i) => String(i.name ?? ''))
  arr(meta.httpMeta, 'http', (i) =>
    i.method && i.route ? `${i.method} ${i.route}` : String(i.route ?? ''),
  )
  rec(meta.channelsMeta, 'channel')
  rec(meta.queueMeta, 'queue')
  rec(meta.schedulerMeta, 'scheduler')
  arr(meta.mcpMeta, 'mcp', (i) => String(i.name ?? i.wireId ?? ''))
  // Scenarios are stored alongside workflows in the meta (a pikkuScenario compiles
  // to a workflow); split them out so they get their own icon/colour, and drop the
  // test-fixture flows the same way the platform Scenarios page does.
  for (const [key, value] of Object.entries(asRecord(meta.workflows))) {
    const item = asRecord(value)
    if (itemIsBuiltIn(item, builtinFuncIds)) continue
    if (Array.isArray(item.tags) && item.tags.includes('test-fixture')) continue
    const isScenario = item.source === 'scenario' || item.scenario === true
    const type: WeaveType = isScenario ? 'scenario' : 'workflow'
    out.push({ id: `${type}:${key}`, type, name: key, meta: item })
  }
  rec(meta.agentsMeta, 'agent')
  rec(asRecord(meta.emailsMeta).templates, 'email')
  arr(meta.cliMeta, 'cli', (i) => String(i.program ?? i.wireId ?? ''))
  rec(meta.triggerMeta, 'trigger')

  return out
}

export const CENTER = ''

export const WIRE_TYPES = new Set<WeaveType>([
  'http',
  'queue',
  'scheduler',
  'mcp',
  'trigger',
  'channel',
  'agent',
])

/** Raw reference ids (funcIds / rpcNames / agent names) a piece points at. */
export function collectRefIds(piece: WeavePiece): string[] {
  const meta = piece.meta
  const ids: string[] = []
  const add = (v: unknown) => {
    if (typeof v === 'string') ids.push(v)
  }
  switch (piece.type) {
    case 'http':
    case 'queue':
    case 'scheduler':
    case 'mcp':
    case 'trigger':
      add(meta.pikkuFuncId)
      break
    case 'channel':
      for (const k of ['connect', 'disconnect', 'message'] as const)
        add(asRecord(meta[k]).pikkuFuncId)
      for (const route of Object.values(asRecord(meta.messageWirings)))
        for (const action of Object.values(asRecord(route))) add(asRecord(action).pikkuFuncId)
      break
    case 'agent':
      if (Array.isArray(meta.tools)) meta.tools.forEach(add)
      if (Array.isArray(meta.agents)) meta.agents.forEach(add)
      break
    case 'workflow':
    case 'scenario':
      // graph-format nodes: each FunctionNode has an rpcName (→ func or sub-workflow);
      // FlowNodes (branch/parallel/return/…) have no rpcName and are skipped.
      for (const node of Object.values(asRecord(meta.nodes))) {
        const r = asRecord(node)
        if ('rpcName' in r) add(r.rpcName)
      }
      break
    // function / email / cli / page: no outward references we can resolve here.
  }
  return ids
}

export type PieceEdges = { parents: string[]; links: string[] }

export function resolveGraph(pieces: WeavePiece[]): Map<string, PieceEdges> {
  // resolution index: functions, workflows/scenarios and agents by every alias
  // (pikkuFuncId / pikkuFuncName / name). Functions win ties (added first).
  const index = new Map<string, string>()
  const addKey = (k: unknown, id: string) => {
    if (typeof k === 'string' && k && !index.has(k)) index.set(k, id)
  }
  for (const p of pieces) {
    if (p.type !== 'function') continue
    addKey(p.meta.pikkuFuncId, p.id)
    addKey(p.meta.pikkuFuncName, p.id)
    addKey(p.name, p.id)
  }
  for (const p of pieces) {
    if (p.type === 'workflow' || p.type === 'scenario' || p.type === 'agent') {
      addKey(p.name, p.id)
      addKey(p.meta.pikkuFuncId, p.id)
    }
  }
  const out = new Map<string, PieceEdges>()
  for (const p of pieces) {
    const refs: string[] = []
    for (const raw of collectRefIds(p)) {
      const target = index.get(raw)
      if (target && target !== p.id && !refs.includes(target)) refs.push(target)
    }
    if (WIRE_TYPES.has(p.type) && refs.length)
      out.set(p.id, { parents: [refs[0]], links: refs.slice(1) })
    else out.set(p.id, { parents: [CENTER], links: refs })
  }
  return out
}

/** Opens an addon piece's package page on npm in a new browser tab. */
export function openAddonPiece(piece: WeavePiece): void {
  const name = typeof piece.meta.name === 'string' ? piece.meta.name : null
  if (!name) return
  window.open(`https://www.npmjs.com/package/${name}`, '_blank', 'noopener,noreferrer')
}

// Width of the docked detail panel — matches the OSS ResizablePanelLayout the
// platform-mode console pages use, so clicking a woven piece opens the SAME docked
// inspector as every other console screen (not a floating drawer).
export const WEAVE_PANEL_WIDTH = 450

export function threadControl(cx: number, cy: number, x: number, y: number, bow: number) {
  const mx = (cx + x) / 2
  const my = (cy + y) / 2
  const dx = x - cx
  const dy = y - cy
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  return [mx + nx * bow, my + ny * bow] as const
}

export function quadLen(cx: number, cy: number, qx: number, qy: number, x: number, y: number) {
  return (
    (Math.hypot(qx - cx, qy - cy) + Math.hypot(x - qx, y - qy) + Math.hypot(x - cx, y - cy)) / 2
  )
}

/* matte outer ply — neutral so the cloth follows the theme, not a fixed gold */
export const YARN = 'color-mix(in srgb, var(--app-text-dim) 45%, var(--app-text-faint))'

export const twill = (line: string, step: number) =>
  `repeating-linear-gradient(0deg, ${line} 0 1px, transparent 1px ${step}px), repeating-linear-gradient(90deg, ${line} 0 1px, transparent 1px ${step}px)`

/* ============================ canvas primitives ============================ */
export const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r)
    return
  }
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/* turn a resolved `rgb(...)`/`rgba(...)` into rgba with the given alpha */
export function withAlpha(rgb: string, a: number) {
  const m = rgb.match(/rgba?\(([^)]+)\)/)
  if (!m) return rgb
  const [r, g, b] = m[1].split(',').map((s) => s.trim())
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export function truncateText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

export type IconEntry = { img: HTMLImageElement; ready: boolean }

export const ICON_CACHE = new Map<string, IconEntry>()

export function iconImage(
  Icon: LucideIcon,
  colorRgb: string,
  size: number,
  onReady: () => void,
): HTMLImageElement | null {
  const key = `${Icon.displayName ?? 'icon'}|${size}|${colorRgb}`
  const hit = ICON_CACHE.get(key)
  if (hit) return hit.ready ? hit.img : null
  const img = new Image()
  const entry: IconEntry = { img, ready: false }
  img.onload = () => {
    entry.ready = true
    onReady()
  }
  img.onerror = () => {
    // Leave unready; the piece just draws without its glyph. Log for context.
    console.error('WeavingBuild: failed to rasterize icon', Icon.displayName)
  }
  const svg = renderToStaticMarkup(createElement(Icon, { color: colorRgb, size, strokeWidth: 2 }))
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  ICON_CACHE.set(key, entry)
  return null
}

export type Resolve = (input: string) => string

export type OnIcon = () => void

/* a labelled fabric patch (sparse counts), drawn on the canvas */
export function drawSwatch(
  ctx: CanvasRenderingContext2D,
  resolve: Resolve,
  onIcon: OnIcon,
  piece: WeavePiece,
  cx0: number,
  cy0: number,
  rot: number,
  hovered: boolean,
  glow: number,
  bloom: number,
) {
  const tn = TYPES[piece.type]
  const color = resolve(tn.color)
  const W = 136
  const H = 52
  const R = 10
  ctx.save()
  ctx.translate(cx0, cy0)
  if (hovered) ctx.translate(0, -3)
  if (rot) ctx.rotate((rot * Math.PI) / 180)
  const scale = bloom * (hovered ? 1.03 : 1)
  if (scale !== 1) ctx.scale(scale, scale)
  ctx.translate(-W / 2, -H / 2)

  // drop shadow (hot glow > hover pop > resting)
  if (glow > 0.05) {
    ctx.shadowColor = withAlpha(color, 0.6 * glow)
    ctx.shadowBlur = 20 * glow
    ctx.shadowOffsetY = 0
  } else if (hovered) {
    ctx.shadowColor = 'rgba(0,0,0,0.18)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 4
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.10)'
    ctx.shadowBlur = 5
    ctx.shadowOffsetY = 1
  }
  roundRectPath(ctx, 0, 0, W, H, R)
  ctx.fillStyle = resolve('color-mix(in srgb, var(--app-accent) 3%, var(--app-panel-bg))')
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // clipped interior: accent stripe with a dashed lightening
  ctx.save()
  roundRectPath(ctx, 0, 0, W, H, R)
  ctx.clip()
  ctx.fillStyle = color
  ctx.fillRect(0, 0, W, 4)
  ctx.fillStyle = resolve('color-mix(in srgb, var(--app-panel-bg) 55%, transparent)')
  for (let x = 2; x < W; x += 5) ctx.fillRect(x, 0, 2, 4)
  ctx.restore()

  // border
  roundRectPath(ctx, 0, 0, W, H, R)
  ctx.lineWidth = hovered || glow > 0.05 ? 1 : 0.5
  ctx.strokeStyle = hovered || glow > 0.05 ? color : resolve('var(--app-border)')
  ctx.stroke()

  // icon chip
  const chipX = 12
  const chipY = (H - 30) / 2
  roundRectPath(ctx, chipX, chipY, 30, 30, 8)
  ctx.fillStyle = resolve(surfOf(tn.color))
  ctx.fill()
  ctx.lineWidth = 0.5
  ctx.strokeStyle = resolve(bdOf(tn.color))
  ctx.stroke()
  const img = iconImage(tn.icon, color, 15, onIcon)
  if (img) ctx.drawImage(img, chipX + 7.5, chipY + 7.5, 15, 15)

  // text column
  const tx = chipX + 39
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = color
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = '0.4px'
  ctx.font = `700 8px ${FONT}`
  ctx.fillText(tn.label().toUpperCase(), tx, 22)
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = '0px'
  ctx.fillStyle = resolve('var(--app-text)')
  ctx.font = `600 13px ${FONT}`
  ctx.fillText(truncateText(ctx, piece.name, W - tx - 12), tx, 39)

  ctx.restore()
}

/* a small woven stitch (dense counts), drawn on the canvas */
export function drawKnot(
  ctx: CanvasRenderingContext2D,
  resolve: Resolve,
  onIcon: OnIcon,
  piece: WeavePiece,
  size: number,
  cx0: number,
  cy0: number,
  rot: number,
  hovered: boolean,
  glow: number,
  bloom: number,
) {
  const tn = TYPES[piece.type]
  const color = resolve(tn.color)
  const R = size * 0.28
  ctx.save()
  ctx.translate(cx0, cy0)
  if (rot) ctx.rotate((rot * Math.PI) / 180)
  const scale = hovered ? 1.9 : glow > 0.05 ? 1 + 0.25 * glow : bloom
  if (scale !== 1) ctx.scale(scale, scale)

  // Shadow ONLY on the (single) hovered or freshly-woven knot — a blurred
  // shadow-fill per knot every frame is the main source of jank at scale, so
  // resting knots draw flat (their border + fill read fine on the cloth).
  const shadowed = hovered || glow > 0.05
  if (shadowed) {
    ctx.shadowColor = hovered ? withAlpha(color, 0.5) : withAlpha(color, 0.7 * glow)
    ctx.shadowBlur = hovered ? 14 : 16 * glow
  }
  roundRectPath(ctx, -size / 2, -size / 2, size, size, R)
  ctx.fillStyle = resolve(surfOf(tn.color))
  ctx.fill()
  if (shadowed) {
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  }
  ctx.lineWidth = 1
  ctx.strokeStyle = hovered || glow > 0.05 ? color : resolve(bdOf(tn.color))
  ctx.stroke()
  const isz = Math.max(8, Math.round(size * 0.5))
  const img = iconImage(tn.icon, color, isz, onIcon)
  if (img) ctx.drawImage(img, -isz / 2, -isz / 2, isz, isz)
  ctx.restore()
}

/* hover tooltip (dense knots) — name + type, floated above the stitch */
export function drawTooltip(
  ctx: CanvasRenderingContext2D,
  resolve: Resolve,
  cx0: number,
  bottomY: number,
  name: string,
  label: string,
  color: string,
) {
  const padX = 9
  const gap = 7
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = `700 12px ${FONT}`
  const nameW = ctx.measureText(name).width
  ctx.font = `600 11px ${FONT}`
  const labelW = ctx.measureText(label).width
  const w = padX * 2 + nameW + gap + labelW
  const h = 24
  const x = cx0 - w / 2
  const y = bottomY - h
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.22)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 4
  roundRectPath(ctx, x, y, w, h, 8)
  ctx.fillStyle = resolve('var(--app-panel-bg)')
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  ctx.lineWidth = 0.5
  ctx.strokeStyle = resolve('var(--app-border)')
  ctx.stroke()
  const midY = y + h / 2 + 4
  ctx.fillStyle = resolve('var(--app-text)')
  ctx.font = `700 12px ${FONT}`
  ctx.fillText(name, x + padX, midY)
  ctx.fillStyle = color
  ctx.font = `600 11px ${FONT}`
  ctx.fillText(label, x + padX + nameW + gap, midY)
  ctx.restore()
}

export type Placed = {
  p: WeavePiece
  x: number
  y: number
  bow: number
  i: number
  parents: string[]
  links: string[]
}

export type Hitbox = { p: WeavePiece; x: number; y: number; w: number; h: number }

export function layoutGraph(
  pieces: WeavePiece[],
  graph: Map<string, PieceEdges>,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  dense: boolean,
  knot: number,
): Placed[] {
  const edgesOf = (id: string) => graph.get(id) ?? { parents: [CENTER], links: [] }
  const n = pieces.length
  const idx = new Map<string, number>()
  pieces.forEach((p, i) => idx.set(p.id, i))
  // primary parent index per piece (-1 = the core → a top-level cluster root)
  const primary = pieces.map((p) => {
    const ps = edgesOf(p.id).parents
    const pid = ps.find((v) => v !== CENTER)
    return pid ? (idx.get(pid) ?? -1) : -1
  })
  const kids = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const par = primary[i]
    if (par === -1) continue
    const arr = kids.get(par)
    if (arr) arr.push(i)
    else kids.set(par, [i])
  }

  // ----- radial sunburst -----
  // Functions (+ non-wire pieces & orphan wires) sit on an inner ellipse; each
  // function's wires sit radially just outside it. Every link — core→function
  // and function→wire — is radial, and radial lines from a shared centre never
  // cross, so the tree reads cleanly even with a hundred-plus functions.
  const coreR = dense ? 58 : 92
  const rawRoots: number[] = []
  primary.forEach((par, i) => {
    if (par === -1) rawRoots.push(i)
  })
  // Interleave the non-function roots (workflows, scenarios, pages, …) evenly
  // among the functions, so their reference links weave across the whole ring
  // as a distributed fabric rather than clumping wherever the meta happened to
  // list them. Functions keep their (domain-grouped) relative order.
  const funcRoots = rawRoots.filter((r) => pieces[r].type === 'function')
  const otherRoots = rawRoots.filter((r) => pieces[r].type !== 'function')
  const roots: number[] = []
  if (otherRoots.length === 0 || funcRoots.length === 0) {
    roots.push(...rawRoots)
  } else {
    const gap = funcRoots.length / (otherRoots.length + 1)
    let oi = 0
    funcRoots.forEach((fr, i) => {
      roots.push(fr)
      while (oi < otherRoots.length && (oi + 1) * gap <= i + 1) roots.push(otherRoots[oi++])
    })
    while (oi < otherRoots.length) roots.push(otherRoots[oi++])
  }
  // angular slice per root weighted by how many wires hang off it (bushier
  // functions get more room).
  const weight = roots.map((r) => 1 + (kids.get(r)?.length ?? 0))
  const totalW = weight.reduce((a, b) => a + b, 0) || 1

  const pos = new Array<{ x: number; y: number }>(n)
  const R1x = rx * 0.6
  const R1y = ry * 0.6
  const stepOut = dense ? 26 : 82 // radial gap from a function to its wire ring
  const fanStep = dense ? 0.05 : 0.09
  // Stagger the functions across 3 interleaved sub-rings so a busy inner ring
  // isn't packed onto one ellipse (cuts crowding ~3×); wires sit just outside
  // each function's own radius. Separation below clears any residual overlap.
  const subRing = dense ? 0.12 : 0.16

  let acc = 0
  roots.forEach((r, k) => {
    const mid = (acc + weight[k] / 2) / totalW
    acc += weight[k]
    const ang = mid * 2 * Math.PI - Math.PI / 2
    const rMul = 1 + ((k % 3) - 1) * subRing
    const fRx = R1x * rMul
    const fRy = R1y * rMul
    pos[r] = { x: cx + Math.cos(ang) * fRx, y: cy + Math.sin(ang) * fRy }
    // wires: radially outward from THIS function, a new ring every 3, with a
    // small angular fan so a function's 2–3 wires don't stack on one radial line
    const ch = kids.get(r) ?? []
    ch.forEach((ci, j) => {
      const ring = 1 + Math.floor(j / 3)
      const a = ang + ((j % 3) - 1) * fanStep
      pos[ci] = {
        x: cx + Math.cos(a) * (fRx + stepOut * ring),
        y: cy + Math.sin(a) * (fRy + stepOut * ring),
      }
    })
  })
  // Multi-parent wires (a channel/agent → several functions) are placed in their
  // *primary* function's ring like any wire, so by default they show one clean
  // radial link; the full fan to their other functions is revealed on hover
  // (see the draw pass). This keeps the tree legible instead of a central knot.
  for (let i = 0; i < n; i++) if (!pos[i]) pos[i] = { x: cx, y: cy }

  // Separation to convergence: AABB sweeps push every overlapping pair apart
  // (biggest penetration axis) until nothing overlaps, then a core-clearance +
  // in-bounds clamp. There's ample empty field outside the rings, so crowded
  // nodes spill outward into it rather than staying stacked. Early-exits once a
  // sweep finds no overlaps.
  const hw = (dense ? knot : 136) / 2 + (dense ? 6 : 10)
  const hh = (dense ? knot : 52) / 2 + (dense ? 6 : 8)
  const cell = Math.max(hw, hh) * 2 + 8
  const key = (gx: number, gy: number) => gx * 100000 + gy
  for (let it = 0; it < 60; it++) {
    const grid = new Map<number, number[]>()
    for (let i = 0; i < n; i++) {
      const k = key(Math.floor(pos[i].x / cell), Math.floor(pos[i].y / cell))
      const arr = grid.get(k)
      if (arr) arr.push(i)
      else grid.set(k, [i])
    }
    let moved = false
    for (let i = 0; i < n; i++) {
      const gx = Math.floor(pos[i].x / cell)
      const gy = Math.floor(pos[i].y / cell)
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const arr = grid.get(key(gx + ox, gy + oy))
          if (!arr) continue
          for (const j of arr) {
            if (j <= i) continue
            const dx = pos[j].x - pos[i].x
            const dy = pos[j].y - pos[i].y
            const px = hw * 2 - Math.abs(dx)
            const py = hh * 2 - Math.abs(dy)
            if (px > 0 && py > 0) {
              moved = true
              if (px < py) {
                const push = ((dx < 0 ? -1 : 1) * (px + 0.5)) / 2
                pos[i].x -= push
                pos[j].x += push
              } else {
                const push = ((dy < 0 ? -1 : 1) * (py + 0.5)) / 2
                pos[i].y -= push
                pos[j].y += push
              }
            }
          }
        }
      }
    }
    // keep clear of the core medallion + inside the field
    for (let i = 0; i < n; i++) {
      const dx = pos[i].x - cx
      const dy = pos[i].y - cy
      const d = Math.hypot(dx, dy) || 1
      if (d < coreR) {
        const f = (coreR - d) / d
        pos[i].x += dx * f
        pos[i].y += dy * f
      }
      pos[i].x = Math.max(hw + 8, Math.min(cx * 2 - hw - 8, pos[i].x))
      pos[i].y = Math.max(hh + 8, Math.min(cy * 2 - hh - 8, pos[i].y))
    }
    if (!moved) break
  }

  // Full graph: functions/roots thread to the core (solid), wires thread to their
  // function (solid), and every other reference (workflow→steps, agent→tools/
  // agents, channel→handlers) is a faint link — the woven fabric.
  return pieces.map((p, i) => {
    const e = edgesOf(p.id)
    return { p, i, parents: e.parents, links: e.links, x: pos[i].x, y: pos[i].y, bow: 0 }
  })
}

/* ================================ keyframes ================================ */
export const KEYFRAMES = `
@keyframes wvb-draw { to { stroke-dashoffset: 0 } }
@keyframes wvb-bloom { 0% { transform: scale(0.35) rotate(-8deg); opacity: 0 } 60% { opacity: 1 } 100% { transform: none; opacity: 1 } }
@keyframes wvb-halo { 0%,100% { transform: scale(0.9); opacity: 0.5 } 50% { transform: scale(1.12); opacity: 0.9 } }
`

export const LAYOUT_KEY = 'weave-layout'
