/**
 * Executable form of the colour contract documented in index.ts.
 *
 * Every rule here used to be a comment. Comments do not fail a build, so the
 * light block silently reintroduced a defect the dark block documents fixing
 * four lines above it (--app-log-info and --app-log-debug identical), and
 * thirteen tokens shipped referenced-but-never-defined. Prose caught none of
 * it. This file is the gate.
 *
 * Run: node --test packages/mantine-theme/src/theme-contract.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'
import { cssVariablesResolver } from './index.ts'

const schemes = cssVariablesResolver({} as never)
const dark = schemes.dark as Record<string, string>
const light = schemes.light as Record<string, string>
const shared = schemes.variables as Record<string, string>

/* ── colour maths (sRGB relative luminance, WCAG 2.1) ─────────────────── */

const channel = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) =>
    channel(parseInt(hex.slice(i, i + 2), 16))
  )
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/**
 * Perceptual distance (OKLab ΔE, ×100).
 *
 * Contrast ratio answers "can I read this on that". It cannot answer "are these
 * two the same colour with two names": #f5f7fb and #f0f3f9 sit at 1.04:1, which
 * is both a legitimate elevation step and an accident, and WCAG has no opinion
 * either way. It also under-reads a hue-only difference — light's
 * --app-sidebar-active is a blue tint at almost the same luminance as
 * --app-sidebar-hover, and a luminance rule would call that a collapse.
 */
const oklab = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) =>
    channel(parseInt(hex.slice(i, i + 2), 16))
  ) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ] as const
}
const deltaE = (a: string, b: string) => {
  const [x, y, z] = oklab(a)
  const [p, q, r] = oklab(b)
  return Math.hypot(x - p, y - q, z - r) * 100
}

/** Resolves var() aliases so a rule cannot be dodged by pointing at a token. */
const resolve = (
  block: Record<string, string>,
  name: string,
  depth = 0
): string | null => {
  const raw = block[name] ?? shared[name]
  if (raw === undefined || depth > 10) return null
  const alias = /^var\((--[a-z0-9-]+)\)$/.exec(raw.trim())
  if (alias) return resolve(block, alias[1]!, depth + 1)
  return /^#[0-9a-f]{6}$/i.test(raw.trim()) ? raw.trim() : null
}

/* ── the contract ─────────────────────────────────────────────────────── */

const SURFACES = [
  '--app-page-bg',
  '--app-page-bg-alt',
  '--app-panel-bg',
  '--app-panel-bg-raised',
  '--app-panel-bg-soft',
  '--app-panel-bg-strong',
  // The sidebar is a surface too. Omitting it is how --app-sidebar-text-muted
  // shipped at 3.57:1: the test only looked where it already passed.
  '--app-sidebar-hover',
  '--app-sidebar-active',
]

/** Rule 1: must clear 4.5:1 on every surface it can land on. */
const TEXT_TOKENS = [
  '--app-text',
  '--app-text-dim',
  '--app-text-faint',
  '--app-gray-sidebar',
  '--app-red',
  '--app-amber',
  '--app-green',
  '--app-accent',
  '--app-violet',
  '--app-sidebar-text',
  '--app-sidebar-text-muted',
  '--app-sidebar-text-soft',
  '--app-sidebar-text-selected',
  '--app-sidebar-text-strong',
  '--app-sidebar-text-parent',
  // Mantine's own dimmed, now aliased into the contract — 346 call sites use it.
  '--mantine-color-dimmed',
]

/**
 * Rule 2: control boundaries must clear 3:1 on every surface.
 *
 * --app-sidebar-chevron is here, not in TEXT_TOKENS: it is a disclosure
 * indicator, so WCAG 1.4.11 governs it at 3:1 rather than 4.5:1. It measured
 * 2.07:1 in light — found only because the token was audited on its way out of
 * this file, which is the argument for keeping component colour under a gate.
 */
const CONTROL_BORDERS = [
  '--app-border-control',
  '--app-border-strong',
  '--app-sidebar-chevron',
]

/**
 * Must stay mutually distinguishable — colour IS the scan affordance here.
 *
 * The --app-log-* group was here too. It is gone because the tokens are gone:
 * five names for colours nothing rendered. Deleting a token deletes its
 * coverage, which is only correct when the token had no consumers — verified
 * by the walk at the bottom of this file plus appColorVars.* access.
 */
const DISTINCT_GROUPS = [
  ['--app-red', '--app-amber', '--app-green', '--app-accent', '--app-violet'],
]

/**
 * Rule 2b: the graphic tier — dots, bars, chart series, icon fills. WCAG 1.4.11
 * governs these at 3:1, so they are free to carry more chroma than any text
 * token can. That freedom is the whole reason the tier exists: no hue-70 colour
 * clears 4.5:1 on white and still reads amber, so amber-as-a-mark and
 * amber-as-a-word cannot be one token.
 *
 * The floor is what stops the tier being a loophole. --app-green-bright shipped
 * at 2.54:1 on white while rendering metric values in lib/metricsColumns.tsx —
 * a token nothing asserted anything about, because it was neither text nor a
 * border. It is here now.
 *
 * --app-gray-dot is deliberately NOT here. It marks absence ("no changes") and
 * measures 1.80 dark / 1.56 light; forcing it to 3:1 would make the muted state
 * the loudest dot in the row. It stays exempt because it is always rendered
 * beside its own label, which is the 1.4.11 exemption, not an oversight.
 */
const GRAPHIC_TOKENS = [
  '--app-accent-alt',
  '--app-green-bright',
  '--app-amber-strong',
  '--app-amber-deep',
]

/**
 * Rule 5: two names must not resolve to one appearance.
 *
 * Every floor here sits below today's measured value, so this asserts the
 * design intent rather than freezing the current hexes — but it fails loudly on
 * the defect it was written for: light's --app-text-dim and --app-text-faint
 * were 3.3 L* apart, its --app-border and --app-border-hover were 1.40 and 1.70
 * on white, and --app-surface-info and --app-surface-interactive were the same
 * hex under two names. All four passed every rule above.
 */
const SEPARATIONS: Array<[a: string, b: string, min: number, why: string]> = [
  ['--app-text', '--app-text-dim', 6, 'the primary/secondary text step'],
  // 3.5, not 3: the light pair this was written for measured 3.22 and looked
  // like one grey. Dark sits at 3.89, so this floor is deliberately tight — a
  // change that lowers it is a change that makes two greys look like one.
  [
    '--app-text-dim',
    '--app-text-faint',
    3.5,
    'secondary vs. de-emphasised text',
  ],
  [
    '--app-border',
    '--app-border-hover',
    4,
    'a hover boundary must read as a change',
  ],
  [
    '--app-border-control',
    '--app-border-strong',
    4,
    'resting vs. emphasised control edge',
  ],
  ['--app-panel-bg', '--app-panel-bg-raised', 1, 'elevation step'],
  ['--app-panel-bg-raised', '--app-panel-bg-soft', 1, 'elevation step'],
  ['--app-panel-bg-soft', '--app-panel-bg-strong', 1, 'elevation step'],
  ['--app-page-bg', '--app-page-bg-alt', 1, 'the two page grounds'],
  ['--app-sidebar-hover', '--app-sidebar-active', 1.5, 'hover vs. selection'],
  [
    '--app-surface-info',
    '--app-surface-success',
    1.5,
    'two tints read side by side',
  ],
  [
    '--app-surface-danger',
    '--app-surface-warning',
    1.5,
    'two tints read side by side',
  ],
]

for (const [schemeName, block] of [
  ['dark', dark],
  ['light', light],
] as const) {
  test(`${schemeName}: text tokens clear WCAG AA on every surface`, () => {
    const failures: string[] = []
    for (const token of TEXT_TOKENS) {
      const fg = resolve(block, token)
      assert.ok(fg, `${token} is not defined in ${schemeName}`)
      for (const surface of SURFACES) {
        const bg = resolve(block, surface)!
        const ratio = contrast(fg, bg)
        if (ratio < 4.5)
          failures.push(`${token} on ${surface}: ${ratio.toFixed(2)}`)
      }
    }
    assert.deepEqual(failures, [], `\n  ${failures.join('\n  ')}\n`)
  })

  test(`${schemeName}: control borders clear WCAG 1.4.11 on every surface`, () => {
    const failures: string[] = []
    for (const token of CONTROL_BORDERS) {
      const fg = resolve(block, token)
      assert.ok(fg, `${token} is not defined in ${schemeName}`)
      for (const surface of SURFACES) {
        const ratio = contrast(fg, resolve(block, surface)!)
        if (ratio < 3)
          failures.push(`${token} on ${surface}: ${ratio.toFixed(2)}`)
      }
    }
    assert.deepEqual(failures, [], `\n  ${failures.join('\n  ')}\n`)
  })

  test(`${schemeName}: graphic tokens clear WCAG 1.4.11 on every surface`, () => {
    const failures: string[] = []
    for (const token of GRAPHIC_TOKENS) {
      const fg = resolve(block, token)
      assert.ok(fg, `${token} is not defined in ${schemeName}`)
      for (const surface of SURFACES) {
        const ratio = contrast(fg, resolve(block, surface)!)
        if (ratio < 3)
          failures.push(`${token} on ${surface}: ${ratio.toFixed(2)}`)
      }
    }
    assert.deepEqual(failures, [], `\n  ${failures.join('\n  ')}\n`)
  })

  test(`${schemeName}: Rule 5 — paired tokens stay perceptibly apart`, () => {
    const failures: string[] = []
    for (const [a, b, min, why] of SEPARATIONS) {
      const [ha, hb] = [resolve(block, a), resolve(block, b)]
      assert.ok(ha && hb, `${a}/${b} undefined in ${schemeName}`)
      const d = deltaE(ha, hb)
      if (d < min)
        failures.push(`${a} vs ${b}: ΔE ${d.toFixed(2)} < ${min} — ${why}`)
    }
    assert.deepEqual(failures, [], `\n  ${failures.join('\n  ')}\n`)
  })

  test(`${schemeName}: no panel recedes below the page it floats on`, () => {
    // panel-bg-strong shipped darker than page-bg in light: a "strong" panel sat
    // in a hole. Ramp monotonicity cannot see this — the ramp was internally
    // ordered and still upside down relative to its own ground. Note the rule is
    // the same in both schemes: elevation moves toward light either way, so dark
    // rises away from a near-black page and light rises away from a grey one.
    const ground = luminance(resolve(block, '--app-page-bg')!)
    const failures = [
      '--app-panel-bg',
      '--app-panel-bg-raised',
      '--app-panel-bg-soft',
      '--app-panel-bg-strong',
    ]
      .map((s) => ({ s, l: luminance(resolve(block, s)!) }))
      .filter(({ l }) => l <= ground)
      .map(
        ({ s, l }) =>
          `${s} (${l.toFixed(4)}) sits below --app-page-bg (${ground.toFixed(4)})`
      )
    assert.deepEqual(failures, [], `\n  ${failures.join('\n  ')}\n`)
  })

  test(`${schemeName}: surface ramp steps are perceptible and monotonic`, () => {
    // The elevation ramp only — sidebar surfaces are not part of it.
    const ordered = [
      '--app-panel-bg',
      '--app-panel-bg-raised',
      '--app-panel-bg-soft',
      '--app-panel-bg-strong',
    ]
    const ls = ordered.map((s) => ({ s, l: luminance(resolve(block, s)!) }))
    const rising = schemeName === 'dark'
    for (let i = 1; i < ls.length; i++) {
      const delta = ls[i]!.l - ls[i - 1]!.l
      assert.ok(
        rising ? delta > 0 : delta < 0,
        `${ls[i]!.s} is not ${rising ? 'lighter' : 'darker'} than ${ls[i - 1]!.s}`
      )
    }
  })

  test(`${schemeName}: the text ramp dims monotonically`, () => {
    const bg = resolve(block, '--app-panel-bg')!
    const [text, dim, faint] = [
      '--app-text',
      '--app-text-dim',
      '--app-text-faint',
    ].map((t) => contrast(resolve(block, t)!, bg))
    assert.ok(
      text! > dim!,
      `--app-text (${text!.toFixed(2)}) must exceed dim (${dim!.toFixed(2)})`
    )
    assert.ok(
      dim! > faint!,
      `--app-text-dim (${dim!.toFixed(2)}) must exceed faint (${faint!.toFixed(2)})`
    )
  })

  test(`${schemeName}: tokens whose whole job is to be told apart are distinct`, () => {
    for (const group of DISTINCT_GROUPS) {
      const seen = new Map<string, string>()
      for (const token of group) {
        const hex = resolve(block, token)!.toLowerCase()
        const clash = seen.get(hex)
        assert.ok(
          !clash,
          `${token} and ${clash} are both ${hex} in ${schemeName}`
        )
        seen.set(hex, token)
      }
    }
  })
}

/** A fill and the label that sits on it. Both directions of the pair matter. */
const FILL_PAIRS: Array<[fill: string, label: string]> = [
  ['--app-accent-strong', '--app-primary-button-fg'],
  ['--app-accent-hover', '--app-accent-hover-fg'],
  ['--app-primary-button-bg', '--app-primary-button-fg'],
  ['--app-primary-button-hover', '--app-primary-button-fg'],
]

for (const [schemeName, block] of [
  ['dark', dark],
  ['light', light],
] as const) {
  test(`${schemeName}: labels are legible on the fills they sit on`, () => {
    const failures: string[] = []
    for (const [fill, label] of FILL_PAIRS) {
      const bg = resolve(block, fill)
      const fg = resolve(block, label)
      assert.ok(bg && fg, `${fill}/${label} undefined in ${schemeName}`)
      const ratio = contrast(fg, bg)
      if (ratio < 4.5) failures.push(`${label} on ${fill}: ${ratio.toFixed(2)}`)
    }
    assert.deepEqual(failures, [], `\n  ${failures.join('\n  ')}\n`)
  })
}

/* ── cross-scheme parity ──────────────────────────────────────────────── */

test('both schemes define exactly the same tokens', () => {
  const onlyDark = Object.keys(dark).filter((k) => !(k in light))
  const onlyLight = Object.keys(light).filter((k) => !(k in dark))
  assert.deepEqual({ onlyDark, onlyLight }, { onlyDark: [], onlyLight: [] })
})

test('a token aliased in one scheme is aliased in the other', () => {
  // Rule 3 exists so two names cannot drift. An alias in dark paired with a
  // literal in light is exactly how --app-status-info drifted off --app-accent.
  const isAlias = (v: string) => /^var\(--/.test(v.trim())
  const mismatched = Object.keys(dark)
    .filter((k) => k in light && isAlias(dark[k]!) !== isAlias(light[k]!))
    .map((k) => `${k}: dark=${dark[k]} light=${light[k]}`)
  assert.deepEqual(mismatched, [], `\n  ${mismatched.join('\n  ')}\n`)
})

/* ── Rules 3 and 4: keeping the vocabulary from regrowing ─────────────── */

/**
 * Rule 3 exceptions: names that share a hex today but are genuinely separate
 * roles, each free to move independently. Every entry needs a reason. Anything
 * NOT listed here must alias instead of repeating a literal, so this list can
 * only shrink — which is the point. It replaced 15 clashing hexes per scheme.
 */
const INDEPENDENT_ROLES: Record<string, string> = {
  '--app-accent': 'the state/selection colour; bound by legibility on panels',
  '--app-sidebar-text-selected':
    'bound by legibility on --app-sidebar-active, which --app-accent is not',
  '--app-gray-sidebar':
    'a sidebar chip colour; already differs from sidebar-text in light',
  '--app-sidebar-text':
    'the sidebar body ramp, asserted against sidebar surfaces',
  '--app-sidebar-text-strong':
    'top of the sidebar ramp, asserted against sidebar surfaces',
  '--app-sidebar-text-parent': 'the sidebar parent-row step, same ramp',
  '--app-text': 'top of the panel text ramp, asserted against panels',
  '--app-text-dim': 'second step of the panel text ramp',
  '--app-text-inverse': 'text on an inverted surface',
  '--app-primary-button-fg': 'a label paired to the primary fill by FILL_PAIRS',
  '--app-accent-hover-fg': 'a label paired to --app-accent-hover by FILL_PAIRS',
  '--app-page-bg': 'the page floor of the surface ramp',
  '--app-panel-bg': 'the panel floor of the surface ramp',
  '--app-border-hover': 'a decorative hover boundary',
  '--app-gray-dot': 'a status dot, not a control boundary',
  '--app-surface-info': 'the info tint',
  '--app-surface-accent': 'the accent tint; signals selection, not information',
  '--app-surface-interactive': 'the interactive tint; signals affordance',
  '--app-accent-alt': 'a step of the accent ramp',
  '--app-accent-secondary': 'the secondary accent',
  '--app-accent-secondary-hover': 'the secondary accent hover step',
  '--app-accent-hover': 'the accent hover step',
  '--app-primary-button-hover': 'a fill bound by FILL_PAIRS',
}

for (const [schemeName, block] of [
  ['dark', dark],
  ['light', light],
] as const) {
  test(`${schemeName}: Rule 3 — no unexplained second name for one colour`, () => {
    const byHex = new Map<string, string[]>()
    for (const [token, raw] of Object.entries(block)) {
      if (!token.startsWith('--app-')) continue
      const hex = /^#[0-9a-f]{6}$/i.exec(raw.trim())?.[0]
      if (hex)
        byHex.set(hex.toLowerCase(), [
          ...(byHex.get(hex.toLowerCase()) ?? []),
          token,
        ])
    }
    const unexplained: string[] = []
    for (const [hex, tokens] of byHex) {
      if (tokens.length < 2) continue
      // Explained only when EVERY name in the clash justifies its own existence.
      const undeclared = tokens.filter((t) => !(t in INDEPENDENT_ROLES))
      if (undeclared.length === 0) continue
      unexplained.push(
        `${hex}: ${tokens.join(', ')} — undeclared: ${undeclared.join(', ')}`
      )
    }
    assert.deepEqual(
      unexplained,
      [],
      `\n  Alias one to the other, or add it to INDEPENDENT_ROLES with a reason:\n  ${unexplained.join('\n  ')}\n`
    )
  })
}

test('Rule 3 — the exception list only shrinks', () => {
  // A ratchet. Without it the cheapest way to pass the rule above is to declare
  // a new exception, which is how prose rules failed: always satisfiable by
  // adding. Lower this number when you collapse a pair; never raise it.
  assert.ok(
    Object.keys(INDEPENDENT_ROLES).length <= 23,
    `INDEPENDENT_ROLES grew to ${Object.keys(INDEPENDENT_ROLES).length}. Alias instead of adding.`
  )
})

/**
 * Rule 4. A token named for a feature is a token the feature should own.
 * --app-chat-* (36), --app-terminal-* (10) and --app-sidebar-* (21) are how this
 * file reached 162 entries; they moved out to the components that use them.
 */
const ROLE_PREFIXES = [
  'page',
  'panel',
  'text',
  'border',
  'surface',
  'shadow',
  'accent',
  'primary',
  'input',
  'glass',
  'red',
  'amber',
  'green',
  'violet',
  'blue',
  'gray',
  // The sidebar keeps the colours this file asserts contrast on — and only those.
  'sidebar',
]

test('Rule 4 — no feature-scoped token prefixes', () => {
  const offenders = [...new Set([...Object.keys(dark), ...Object.keys(light)])]
    .filter((k) => k.startsWith('--app-'))
    .filter(
      (k) => !ROLE_PREFIXES.includes(k.slice('--app-'.length).split('-')[0]!)
    )
  assert.deepEqual(
    offenders,
    [],
    `\n  These name a feature, not a role. Put them in that component's own CSS:\n  ${offenders.join('\n  ')}\n`
  )
})

/* ── consumption ──────────────────────────────────────────────────────── */

test('every --app-* token referenced anywhere is defined', () => {
  // The trees to walk are the CONSUMER's, so they are passed in: this package
  // ships the palette but nothing that uses it, and each console consuming the
  // contract has to be checked against its own source. Fabric runs this with its
  // apps/console/src and packages roots (more than one, because --app-hover-bg
  // sat undefined in packages/components while the walk only looked at the app).
  const roots = (process.env.THEME_CONTRACT_ROOTS ?? '')
    .split(':')
    .filter(Boolean)
    .map((root) => resolvePath(root))
  if (roots.length === 0) {
    // Nothing to check rather than a false pass: the package's own test run has
    // no consumer tree, and the consoles set the variable in their test scripts.
    return
  }
  const defined = new Set([
    ...Object.keys(dark),
    ...Object.keys(light),
    ...Object.keys(shared),
  ])
  const referenced = new Map<string, string>()

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.pikku')
        continue
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        walk(path)
        continue
      }
      if (!/\.(tsx?|css)$/.test(entry)) continue
      const text = readFileSync(path, 'utf8')
      for (const [, token] of text.matchAll(/var\((--app-[a-z0-9-]+)/g)) {
        if (!referenced.has(token!)) referenced.set(token!, path)
      }
      // Non-colour geometry (card radius, card gutter) is declared in the app's
      // own :root rather than the colour contract — a declaration there defines
      // the token just as much as one in this package does.
      for (const [, token] of text.matchAll(/^\s*(--app-[a-z0-9-]+)\s*:/gm))
        defined.add(token!)
    }
  }
  roots.forEach(walk)

  const undefinedTokens = [...referenced]
    .filter(([token]) => !defined.has(token))
    .map(([token, path]) => `${token} (first seen ${path})`)
    .sort()
  assert.deepEqual(undefinedTokens, [], `\n  ${undefinedTokens.join('\n  ')}\n`)
})
