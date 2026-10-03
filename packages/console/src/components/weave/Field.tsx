import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { WovenMark } from './WovenMark'
import { m } from '@/i18n/messages'
import type { WeavePiece, WeaveLayout } from './types'
import {
  HOT_MS,
  GOLD,
  TYPES,
  CENTER,
  resolveGraph,
  openAddonPiece,
  threadControl,
  quadLen,
  YARN,
  twill,
  drawSwatch,
  drawKnot,
  drawTooltip,
  Placed,
  Hitbox,
  layoutGraph,
} from './internal'

import { usePieceOpener } from './usePieceOpener'

import { useSize } from './useSize'
import { useColorResolver } from './useColorResolver'

export function Field({
  pieces,
  hot,
  layout,
  openPage,
}: {
  pieces: WeavePiece[]
  hot: Map<string, number>
  layout: WeaveLayout
  openPage?: (piece: WeavePiece) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const markRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef<string | null>(null)
  const hitboxes = useRef<Hitbox[]>([])
  const redrawRef = useRef<() => void>(() => {})
  const { w: CW, h: CH } = useSize(wrapRef)
  const openPanel = usePieceOpener()
  const resolve = useColorResolver(probeRef)
  const reduceMotion = useMemo(
    () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  // Pages open the live route and addons open their npm page (both new tabs);
  // everything else opens its detail panel.
  const open = (piece: WeavePiece) =>
    piece.type === 'page'
      ? openPage?.(piece)
      : piece.type === 'addon'
        ? openAddonPiece(piece)
        : openPanel(piece)

  const total = pieces.length
  const dense = total > 24
  const knot = total > 70 ? 15 : total > 40 ? 19 : 24

  const ready2 = !!(CW && CH)
  const FW = CW || 900
  const FH = CH || 620
  const cx = FW / 2
  const cy = FH / 2
  const rx = Math.max(200, FW / 2 - (dense ? 58 : 96))
  const ry = Math.max(150, FH / 2 - (dense ? 42 : 58))

  // The dependency graph over the *filtered* pieces (a reference whose target is
  // hidden by the type filter simply doesn't resolve → no edge).
  const graph = useMemo(() => resolveGraph(pieces), [pieces])
  const placed = useMemo<Placed[]>(() => {
    if (layout === 'graph' && pieces.length > 0) {
      return layoutGraph(pieces, graph, cx, cy, rx, ry, dense, knot)
    }
    // Radial: the original woven-from-core field — every piece threads to the
    // centre (no fabric links), on the golden-angle spiral.
    const mnx = rx * (dense ? 0.14 : 0.27)
    const mny = ry * (dense ? 0.16 : 0.29)
    return pieces.map((p, i) => {
      const ang = i * GOLD - Math.PI / 2
      const fr = Math.sqrt((i + 0.6) / Math.max(1, total))
      const ex = mnx + (rx - mnx) * fr
      const ey = mny + (ry - mny) * fr
      return {
        p,
        i,
        parents: [CENTER],
        links: [],
        x: cx + Math.cos(ang) * ex,
        y: cy + Math.sin(ang) * ey,
        bow: (i % 2 ? 1 : -1) * Math.min(dense ? 26 : 60, fr * rx * 0.2),
      }
    })
  }, [pieces, rx, ry, dense, total, cx, cy, layout, knot, graph])

  // Latest inputs for the imperative draw loop, read without re-subscribing.
  const drawState = useRef({ placed, hot, dense, cx, cy, FW, FH, knot, layout })
  drawState.current = { placed, hot, dense, cx, cy, FW, FH, knot, layout }

  // Paint threads + every piece + hover tooltip, and position the mark, for the
  // given time. RAF loop (or one static frame under reduced motion) — React
  // never re-renders on the clock or hover, so cost is flat as pieces scale.
  const draw = useCallback(
    (time: number, nowMs: number) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      const { placed, hot, dense, cx, cy, FW, FH, knot, layout } = drawState.current
      const onIcon = () => redrawRef.current()
      const dpr = window.devicePixelRatio || 1
      const needW = Math.round(FW * dpr)
      const needH = Math.round(FH * dpr)
      if (canvas.width !== needW || canvas.height !== needH) {
        canvas.width = needW
        canvas.height = needH
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, FW, FH)
      ctx.lineCap = 'round'

      const A = dense ? 3 : 5
      const hoverId = hoverRef.current
      const boxes: Hitbox[] = []
      let hoveredDraw: {
        n: Placed
        lx: number
        ly: number
        rot: number
        glow: number
        bloom: number
      } | null = null

      // live (breathing) position of every piece, keyed by id, so a thread can
      // start from its parent function's current position (graph mode) instead
      // of always the core.
      const live = new Map<string, { x: number; y: number }>()
      for (const n of placed) {
        const ph = n.i * 1.3
        live.set(n.p.id, {
          x: n.x + A * Math.sin(time * 0.62 + ph),
          y: n.y + A * Math.cos(time * 0.7 + ph),
        })
      }
      const parentPos = (id: string) =>
        id === CENTER ? { x: cx, y: cy } : (live.get(id) ?? { x: cx, y: cy })
      // per-edge bow: radial keeps its precomputed sweep; graph bows in proportion
      // to the (short) parent→wire edge so links read as gentle arcs, not sticks.
      const edgeBow = (n: Placed, sx: number, sy: number, ex: number, ey: number) =>
        layout === 'graph'
          ? (n.i % 2 ? 1 : -1) * Math.min(dense ? 16 : 30, Math.hypot(ex - sx, ey - sy) * 0.16)
          : n.bow

      // Hover → trace the whole path from the hovered piece back to the core:
      // walk parents (structural) upward, and include its reference links (and
      // each of those back to the core). Those nodes/edges are drawn prominent
      // and everything else is dimmed, so the connected path pops.
      const hasHover = !!hoverId
      let activeEdges: Set<string> | null = null
      if (hasHover) {
        const byId = new Map<string, Placed>()
        for (const pl of placed) byId.set(pl.p.id, pl)
        activeEdges = new Set<string>()
        const walk = (start: string) => {
          let cur = start
          for (let guard = 0; guard < 64; guard++) {
            const pl = byId.get(cur)
            if (!pl) break
            const par = pl.parents[0] ?? CENTER
            activeEdges!.add(`${cur}>${par}`)
            if (par === CENTER) break
            cur = par
          }
        }
        const h = byId.get(hoverId!)
        if (h) {
          walk(hoverId!)
          for (const l of h.links) {
            activeEdges!.add(`${hoverId!}>${l}`)
            walk(l)
          }
        }
      }
      const edgeActive = (src: string, dst: string) =>
        !hasHover || activeEdges!.has(`${src}>${dst}`)

      // pass 1: threads (drawn under the pieces). Each piece draws a solid
      // structural thread (to the core, or a wire → its function) plus a faint
      // thread to every other thing it references — that cross-weave is the
      // fabric. Hovering a piece lights up all of its reference links.
      for (const n of placed) {
        const me = live.get(n.p.id)!
        const color = TYPES[n.p.type].color
        const plies = dense
          ? [{ off: 0, col: color, w: 1.1, op: 0.5 }]
          : [
              { off: -4.5, col: YARN, w: 1.5, op: 0.34 },
              { off: 0, col: color, w: 2.2, op: 0.6 },
              {
                off: 3,
                col: `color-mix(in srgb, ${color} 45%, var(--app-panel-bg))`,
                w: 1.2,
                op: 0.5,
              },
            ]
        for (const parentId of n.parents) {
          const par = parentPos(parentId)
          const base = edgeBow(n, par.x, par.y, me.x, me.y)
          // all threads are faded by default; hovering a piece glows up only the
          // edges on its path back to the core. Icons are left untouched.
          const act = hasHover && edgeActive(n.p.id, parentId ?? CENTER)
          for (let k = 0; k < plies.length; k++) {
            const s = plies[k]
            const [qx, qy] = threadControl(
              par.x,
              par.y,
              me.x,
              me.y,
              base + s.off + 4 * Math.sin(time * 1.1 + n.i + k),
            )
            ctx.beginPath()
            ctx.moveTo(par.x, par.y)
            ctx.quadraticCurveTo(qx, qy, me.x, me.y)
            ctx.strokeStyle = resolve(s.col)
            ctx.lineWidth = act ? s.w * 1.7 : s.w
            ctx.globalAlpha = act ? Math.min(1, s.op * 1.8) : s.op * 0.28
            ctx.stroke()
          }
        }
        if (n.links.length) {
          const rc = resolve(color)
          for (const linkId of n.links) {
            const par = parentPos(linkId)
            const base = edgeBow(n, par.x, par.y, me.x, me.y)
            const [qx, qy] = threadControl(
              par.x,
              par.y,
              me.x,
              me.y,
              base + 4 * Math.sin(time * 1.1 + n.i),
            )
            const act = hasHover && edgeActive(n.p.id, linkId)
            ctx.beginPath()
            ctx.moveTo(par.x, par.y)
            ctx.quadraticCurveTo(qx, qy, me.x, me.y)
            ctx.strokeStyle = rc
            // faded by default; the hovered node's links glow up.
            ctx.lineWidth = act ? 2.0 : 0.7
            ctx.globalAlpha = act ? 0.92 : 0.1
            ctx.stroke()
          }
        }
        const at = hot.get(n.p.id)
        if (at !== undefined && n.parents.length) {
          const par = parentPos(n.parents[0] ?? CENTER)
          const base = edgeBow(n, par.x, par.y, me.x, me.y)
          const glow = 1 - Math.min(1, (nowMs - at) / HOT_MS)
          const [qx, qy] = threadControl(
            par.x,
            par.y,
            me.x,
            me.y,
            base + 6 * Math.sin(time * 1.6 + n.i),
          )
          const rc = resolve(color)
          // Soft glow via a wide, low-alpha stroke — a real canvas blur filter
          // here is prohibitively expensive per hot thread each frame.
          ctx.beginPath()
          ctx.moveTo(par.x, par.y)
          ctx.quadraticCurveTo(qx, qy, me.x, me.y)
          ctx.strokeStyle = rc
          ctx.lineWidth = 7
          ctx.globalAlpha = glow * 0.28
          ctx.stroke()
          const pr = reduceMotion ? 1 : Math.min(1, (nowMs - at) / 620)
          const eased = pr < 0.5 ? 2 * pr * pr : 1 - Math.pow(-2 * pr + 2, 2) / 2
          const len = quadLen(par.x, par.y, qx, qy, me.x, me.y)
          ctx.beginPath()
          ctx.moveTo(par.x, par.y)
          ctx.quadraticCurveTo(qx, qy, me.x, me.y)
          ctx.strokeStyle = rc
          ctx.lineWidth = 2.2
          ctx.globalAlpha = glow * 0.95
          ctx.setLineDash([len, len])
          ctx.lineDashOffset = len * (1 - eased)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }
      ctx.globalAlpha = 1

      // pass 2: pieces (hovered one deferred so it draws on top)
      for (const n of placed) {
        const ph = n.i * 1.3
        const me = live.get(n.p.id)!
        const lx = me.x
        const ly = me.y
        const rot = (dense ? 1.4 : 2.2) * Math.sin(time * 0.55 + ph)
        const at = hot.get(n.p.id)
        const glow = at !== undefined ? 1 - Math.min(1, (nowMs - at) / HOT_MS) : 0
        const bloom =
          at !== undefined && !reduceMotion
            ? (() => {
                const p = Math.min(1, (nowMs - at) / 620)
                return 0.35 + 0.65 * (1 - Math.pow(1 - p, 3))
              })()
            : 1
        const w = dense ? knot : 136
        const h = dense ? knot : 52
        boxes.push({ p: n.p, x: lx, y: ly, w, h })
        if (hoverId === n.p.id) {
          hoveredDraw = { n, lx, ly, rot, glow, bloom }
          continue
        }
        if (dense) drawKnot(ctx, resolve, onIcon, n.p, knot, lx, ly, rot, false, glow, bloom)
        else drawSwatch(ctx, resolve, onIcon, n.p, lx, ly, rot, false, glow, bloom)
      }

      // hovered piece on top, plus its tooltip (dense)
      if (hoveredDraw) {
        const { n, lx, ly, glow, bloom } = hoveredDraw
        if (dense) {
          drawKnot(ctx, resolve, onIcon, n.p, knot, lx, ly, 0, true, glow, bloom)
          drawTooltip(
            ctx,
            resolve,
            lx,
            ly - (knot * 1.9) / 2 - 6,
            n.p.name,
            TYPES[n.p.type].label(),
            resolve(TYPES[n.p.type].color),
          )
        } else {
          drawSwatch(ctx, resolve, onIcon, n.p, lx, ly, 0, true, glow, bloom)
        }
      }
      hitboxes.current = boxes

      const breathe = 1 + 0.03 * Math.sin(time * 0.9)
      if (markRef.current) {
        markRef.current.style.transform = `translate(-50%,-50%) scale(${breathe})`
      }
    },
    [resolve, reduceMotion],
  )
  redrawRef.current = () => draw(reduceMotion ? 0 : performance.now() / 1000, performance.now())

  // Continuous animation; off under reduced motion. Cadence eases off as the
  // field grows (the jitter is subtle, so fewer frames on a huge field is
  // imperceptible but keeps it smooth): ~30fps up to ~250 pieces, ~22fps beyond.
  useEffect(() => {
    if (reduceMotion) return
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      const gap = drawState.current.placed.length > 250 ? 45 : 32
      if (now - last > gap) {
        last = now
        draw(now / 1000, now)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw, reduceMotion])

  // Immediate correct frame on mount / input change (also the sole paint, and
  // the hot-glow fade driver, under reduced motion).
  useLayoutEffect(() => {
    draw(reduceMotion ? 0 : performance.now() / 1000, performance.now())
  }, [draw, reduceMotion, placed, hot, FW, FH, dense])
  useEffect(() => {
    if (!reduceMotion || hot.size === 0) return
    const id = setInterval(() => redrawRef.current(), 250)
    return () => clearInterval(id)
  }, [reduceMotion, hot])

  const pieceAt = (mx: number, my: number): WeavePiece | null => {
    const boxes = hitboxes.current
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i]
      if (Math.abs(mx - b.x) <= b.w / 2 && Math.abs(my - b.y) <= b.h / 2) return b.p
    }
    return null
  }
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const hit = pieceAt(e.clientX - rect.left, e.clientY - rect.top)
    const id = hit?.id ?? null
    e.currentTarget.style.cursor = hit ? 'pointer' : 'default'
    if (id !== hoverRef.current) {
      hoverRef.current = id
      if (reduceMotion) redrawRef.current()
    }
  }
  const onMouseLeave = () => {
    if (hoverRef.current !== null) {
      hoverRef.current = null
      if (reduceMotion) redrawRef.current()
    }
  }
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const hit = pieceAt(e.clientX - rect.left, e.clientY - rect.top)
    if (hit) open(hit)
  }

  // Cloth base: a faint accent wash + neutral weave threads, so the field takes
  // its tint from the active theme accent instead of a fixed warm gold.
  const clothBg: React.CSSProperties = {
    background: 'color-mix(in srgb, var(--app-accent) 3%, var(--app-page-bg-alt))',
    backgroundImage: `${twill('color-mix(in srgb, var(--app-text) 4%, transparent)', 6)}, repeating-linear-gradient(45deg, color-mix(in srgb, var(--app-text) 5%, transparent) 0 1px, transparent 1px 6px)`,
  }

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        ...clothBg,
      }}
    >
      {/* hidden probe: lets the canvas resolve theme vars / color-mix to rgb */}
      <span
        ref={probeRef}
        aria-hidden
        style={{ position: 'absolute', width: 0, height: 0, visibility: 'hidden' }}
      />
      {!ready2 ? null : (
        <div style={{ position: 'relative', width: FW, height: FH }}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={m.weaving_pieces({ count: total })}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            onClick={onClick}
            style={{ position: 'absolute', inset: 0, width: FW, height: FH, zIndex: 1 }}
          />

          {/* the mark — a woven medallion, gently breathing (single DOM node) */}
          <div
            ref={markRef}
            style={{
              position: 'absolute',
              left: cx,
              top: cy,
              transform: 'translate(-50%,-50%)',
              zIndex: 3,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: 66,
                height: 66,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'color-mix(in srgb, var(--app-accent) 4%, var(--app-panel-bg))',
                border: '0.5px solid var(--app-border)',
                boxShadow: 'var(--app-shadow-panel)',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  inset: -7,
                  borderRadius: '50%',
                  background:
                    'radial-gradient(circle, color-mix(in srgb,var(--app-accent) 13%,transparent), transparent 68%)',
                  animation: 'wvb-halo 3.2s ease-in-out infinite',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  inset: 5,
                  borderRadius: '50%',
                  border: '1px dashed color-mix(in srgb, var(--app-text-faint) 55%, transparent)',
                }}
              />
              {/* The `flow` weave mark — its own motion, no hand-rolled rotation.
                  Accent loop is the brand primary. */}
              <WovenMark size={34} variant="flow" weave="var(--app-accent)" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
