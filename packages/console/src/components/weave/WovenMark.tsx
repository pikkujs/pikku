import { useId } from 'react'
import clsx from 'clsx'
import classes from './WovenMark.module.css'

export type WovenMarkMotion =
  | 'thread'
  | 'interlock'
  | 'cinch'
  | 'sheen'
  | 'flow'
  | 'breathe'
  | 'loom'
  | 'shuttle'
  | 'pop'
  | 'ping'
  | 'scan'
  | 'wobble'

export type WovenMarkStatus =
  | 'design'
  | 'build'
  | 'test'
  | 'deploy'
  | 'live'
  | 'failed'
  | 'queued'
  | 'sleep'

export type WovenMarkVariant = WovenMarkMotion | WovenMarkStatus | 'static'

type Layer = 'band' | 'scan' | 'flow' | 'pass' | 'bead' | 'ring' | 'streak'

const LAYER: Partial<Record<WovenMarkVariant, readonly Layer[]>> = {
  sheen: ['band'],
  scan: ['scan'],
  flow: ['flow'],
  shuttle: ['bead'],
  ping: ['ring'],
  design: [],
  build: ['bead'],
  test: ['pass'],
  deploy: ['streak'],
  live: ['ring'],
  queued: ['band'],
}

const STATUS_ACCENT: Record<WovenMarkStatus, string> = {
  design: '#8b93a8',
  build: '#eaa02e',
  test: '#35b07a',
  deploy: '#eaa02e',
  live: '#35b07a',
  failed: '#e85c52',
  queued: '#eaa02e',
  sleep: '#646c78',
}

const STATUSES = new Set<string>(Object.keys(STATUS_ACCENT))

const CROSSBAR = 'M23 22H77'
const STEM = 'M35.5 14V64C35.5 78 49 86 63 86'
const WAIST = 'M23 48H63'
const PATHS = [CROSSBAR, STEM, WAIST] as const

export interface WovenMarkProps {
  /** Animation treatment. Defaults to `breathe` (a calm idle pulse). */
  variant?: WovenMarkVariant
  /** Colour of the glyph on motion marks. */
  ink?: string
  /** Accent colour: the moving layer, and the whole glyph on lifecycle marks. */
  weave?: string
  /** Rendered px size (square). */
  size?: number
  /** Stroke width in viewBox units (128 square). */
  strokeWidth?: number
  className?: string
  'aria-label'?: string
}

export function WovenMark({
  variant = 'breathe',
  ink = '#e8e9ee',
  weave,
  size = 156,
  strokeWidth = 17,
  className,
  'aria-label': ariaLabel = 'PikkuFabric mark',
}: WovenMarkProps) {
  const raw = useId()
  const uid = 'm' + raw.replace(/[^a-zA-Z0-9]/g, '')
  const layers = LAYER[variant] ?? []
  const status = STATUSES.has(variant)
  const accent = weave ?? (status ? STATUS_ACCENT[variant as WovenMarkStatus] : '#3f7bf5')
  const glyph = status ? accent : ink
  const banded = layers.includes('band') || layers.includes('scan')

  const strokes = (cls?: string, stroke?: string) => (
    <g
      className={clsx(classes.strokes, cls)}
      strokeWidth={strokeWidth}
      style={stroke ? { stroke, color: stroke } : undefined}
    >
      {PATHS.map((d, i) => (
        <path key={d} className={clsx(classes.s, classes[`s${i + 1}`])} pathLength={1} d={d} />
      ))}
    </g>
  )

  return (
    <svg
      className={clsx(classes.mark, classes[variant], className)}
      width={size}
      height={size}
      viewBox="-3 -3 106 106"
      fill="none"
      shapeRendering="geometricPrecision"
      role="img"
      aria-label={ariaLabel}
    >
      {banded && (
        <defs>
          <linearGradient
            id={`g${uid}`}
            x1="0"
            y1="0"
            x2={layers.includes('scan') ? '0' : '1'}
            y2={layers.includes('scan') ? '1' : '0'}
          >
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask
            id={`m${uid}`}
            maskUnits="userSpaceOnUse"
            x="-20"
            y="-20"
            width="140"
            height="140"
          >
            <rect
              className={clsx(classes.band, layers.includes('scan') && classes.bandY)}
              x={layers.includes('scan') ? -20 : -96}
              y={layers.includes('scan') ? -96 : -20}
              width={layers.includes('scan') ? 140 : 72}
              height={layers.includes('scan') ? 64 : 140}
              fill={`url(#g${uid})`}
            />
          </mask>
        </defs>
      )}

      {strokes(undefined, `var(--wm-ink, ${glyph})`)}

      {banded && (
        <g mask={`url(#m${uid})`}>{strokes(classes.bandLayer, `var(--wm-weave, ${accent})`)}</g>
      )}
      {layers.includes('flow') &&
        strokes(classes.flowLayer, `var(--wm-weave, ${accent})`)}
      {layers.includes('pass') && strokes(classes.passLayer, `var(--wm-weave, ${accent})`)}
      {layers.includes('streak') && (
        <path
          className={classes.streak}
          pathLength={1}
          d={STEM}
          strokeWidth={strokeWidth * 0.55}
          style={{ stroke: `var(--wm-streak, #ffffff)` }}
        />
      )}
      {layers.includes('bead') && (
        <circle
          className={classes.bead}
          r={strokeWidth * 0.42}
          cx="0"
          cy="0"
          style={{ offsetPath: `path("${STEM}")`, fill: `var(--wm-weave, ${accent})` }}
        />
      )}
      {layers.includes('ring') && (
        <circle
          className={classes.ring}
          cx="63"
          cy="86"
          r="14"
          strokeWidth={strokeWidth * 0.35}
          style={{ stroke: `var(--wm-weave, ${accent})` }}
        />
      )}
    </svg>
  )
}

export interface WovenMarkVariantInfo {
  id: WovenMarkVariant
  no: string
  name: string
  /** moment (motion marks) or page (status marks) — the chip label */
  tag: string
  desc: string
  ink?: string
  weave?: string
  color?: string
}

export const WOVEN_MARK_MOTIONS: readonly WovenMarkVariantInfo[] = [
  {
    id: 'thread',
    no: '01',
    name: 'Thread',
    tag: 'load-in',
    desc: 'Each stroke draws itself on in order — crossbar, stem, waist — the mark threading into being.',
  },
  {
    id: 'interlock',
    no: '02',
    name: 'Interlock',
    tag: 'assemble',
    desc: 'The two bars slide in from opposite edges and settle against the stem.',
  },
  {
    id: 'cinch',
    no: '03',
    name: 'Cinch',
    tag: 'confirm',
    desc: 'The strokes pull in toward their centres and release — a satisfying snap of completion.',
  },
  {
    id: 'sheen',
    no: '04',
    name: 'Sheen',
    tag: 'brand idle',
    desc: 'A band of satin light sweeps across the mark on a slow loop.',
  },
  {
    id: 'flow',
    no: '05',
    name: 'Flow',
    tag: 'working',
    desc: 'A pulse of light runs the strokes, the waist counter to the rest — work in progress.',
  },
  {
    id: 'breathe',
    no: '06',
    name: 'Breathe',
    tag: 'loading',
    desc: 'A calm weight-and-glow pulse. Reads as a quiet, indefinite loading state.',
  },
  {
    id: 'loom',
    no: '07',
    name: 'Loom',
    tag: 'cycle',
    desc: 'The bars shuttle against each other with a dwell between picks — like a loom indexing.',
  },
  {
    id: 'shuttle',
    no: '08',
    name: 'Shuttle',
    tag: 'streaming',
    desc: 'A bead runs the stem out to the hook — one unit of work moving through.',
  },
  {
    id: 'pop',
    no: '09',
    name: 'Pop',
    tag: 'published',
    desc: 'Springs in with a stamp-like overshoot, then clears — a publish / success beat.',
  },
  {
    id: 'ping',
    no: '10',
    name: 'Ping',
    tag: 'live',
    desc: 'Emits soft rings from the hook terminal on a heartbeat — for live, alert or notifying states.',
  },
  {
    id: 'scan',
    no: '11',
    name: 'Scan',
    tag: 'build',
    desc: 'A bright line scans down through the mark, like a build sweeping the source.',
  },
  {
    id: 'wobble',
    no: '12',
    name: 'Wobble',
    tag: 'playful',
    desc: 'A short rotational jitter — the mark with a little personality.',
  },
]

export const WOVEN_MARK_STATUSES: readonly WovenMarkVariantInfo[] = [
  {
    id: 'design',
    no: 'P1',
    name: 'Designing',
    tag: 'Design',
    color: '#8b93a8',
    weave: '#8b93a8',
    desc: 'Sparse dashes drift along the strokes — the agent sketching structure, nothing built yet.',
  },
  {
    id: 'build',
    no: 'P2',
    name: 'Building',
    tag: 'Build',
    color: '#eaa02e',
    weave: '#eaa02e',
    desc: 'A bead climbs the stem while the glyph holds — compiling functions one at a time.',
  },
  {
    id: 'test',
    no: 'P3',
    name: 'Testing',
    tag: 'Test',
    color: '#35b07a',
    weave: '#35b07a',
    desc: 'Each stroke ticks over green in turn, holds, then clears — the suite passing file by file.',
  },
  {
    id: 'deploy',
    no: 'P4',
    name: 'Deploying',
    tag: 'Deploy',
    color: '#eaa02e',
    weave: '#eaa02e',
    desc: 'An amber streak runs the stem toward the hook as the build uploads and publishes.',
  },
  {
    id: 'live',
    no: 'P5',
    name: 'Live',
    tag: 'Live',
    color: '#35b07a',
    weave: '#35b07a',
    desc: 'A calm green breath with a heartbeat ring at the terminal — healthy, deployed and serving.',
  },
  {
    id: 'failed',
    no: 'P6',
    name: 'Failed',
    tag: 'Error',
    color: '#e85c52',
    weave: '#e85c52',
    desc: 'A sharp shake and red flicker — the mark catching a build or deploy error.',
  },
  {
    id: 'queued',
    no: 'P7',
    name: 'Queued',
    tag: 'Queue',
    color: '#eaa02e',
    weave: '#eaa02e',
    desc: 'Dimmed, with a slow amber sweep that waits — parked in line for a build slot.',
  },
  {
    id: 'sleep',
    no: 'P8',
    name: 'Sleeping',
    tag: 'Idle',
    color: '#7b8694',
    weave: '#646c78',
    ink: '#646c78',
    desc: 'A dim, slow drift with the occasional blink — a stage gone to sleep.',
  },
]
