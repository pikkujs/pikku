import {
  createTheme,
  mergeThemeOverrides,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core'

const emerald: MantineColorsTuple = [
  '#e6fff5',
  '#b3ffe0',
  '#80ffcc',
  '#4dffb8',
  '#1affa3',
  '#00e68a',
  '#00cc7a',
  '#00b36b',
  '#00995c',
  '#00804d',
]

const primary: MantineColorsTuple = [
  '#eff6ff',
  '#dbeafe',
  '#bfdbfe',
  '#93c5fd',
  '#60a5fa',
  '#3b82f6',
  '#2563eb',
  '#1d4ed8',
  '#1e40af',
  '#1e3a8a',
]

const secondary: MantineColorsTuple = [
  '#e8f2ff',
  '#cfe2ff',
  '#9fc3ff',
  '#6ca2ff',
  '#4587ff',
  '#2d76ff',
  '#1b67ec',
  '#1058d2',
  '#0a4ab0',
  '#043d8d',
]

const dark: MantineColorsTuple = [
  '#C1C2C5',
  '#A6A7AB',
  '#909296',
  '#7a7d85',
  '#373A40',
  '#2C2E33',
  '#1a1c24',
  '#13151c',
  '#0e1016',
  '#0b0d12',
]

/**
 * The console colour contract. Read this before adding a token.
 *
 * PICK AN EXISTING TOKEN FIRST. Most "I need a new colour" moments are really a
 * missing rule about which existing one applies. This palette previously grew to
 * 151 tokens with four different names for #f87171, and nothing said which to use.
 *
 * The roles, in the order you should reach for them:
 *
 *   Surfaces   --app-page-bg < --app-panel-bg < -raised < -soft < -strong
 *              One cool axis (OKLCH hue 262). Steps are >=2.4 L* so each level is
 *              actually visible. Capped at L*17 — see the dark block comment.
 *
 *   Text       --app-text > --app-text-dim > --app-text-faint
 *              Monotonic: each is dimmer than the last. All three clear WCAG AA
 *              (>=4.5:1) on EVERY surface above. If you need dimmer than faint,
 *              you need a different layout, not a fourth grey.
 *
 *   Borders    --app-border / -hover      decorative dividers only
 *              --app-border-control       interactive control boundaries
 *              --app-border-strong        emphasis boundaries
 *              The bottom two clear WCAG 1.4.11 (>=3:1) on every surface; the top
 *              two do not, and must never be used on an interactive control.
 *
 *   Accent     --app-accent (state, selection, current) / -hover / -strong (fills)
 *              Means the same thing in BOTH colour schemes. Not decoration: if it
 *              is on an element regardless of that element's state, it is wrong.
 *
 *   Status     --app-red / -amber / -green / -violet  + matching --app-surface-*
 *              This is THE status vocabulary, and now the ONLY one. --app-log-*
 *              and --app-status-* were a second and third spelling of the same
 *              five colours; both are deleted, their call sites point here.
 *
 * These rules are ENFORCED, not advisory: theme-contract.test.ts asserts every
 * one of them against both schemes plus the console's actual token usage. They
 * were prose once, and the light block silently reintroduced a defect the dark
 * block documents fixing four lines above it. Run `yarn test` in this package.
 *
 * RULES
 * 1. Every text colour must clear 4.5:1 on every surface it can land on. Verify,
 *    don't estimate — this file has been wrong about it before.
 * 2. A control boundary must clear 3:1. A translucent fill CANNOT do this on dark
 *    (max ~1.34:1); the border carries it.
 * 3. Never add a second name for a colour that already exists. Alias it instead,
 *    so the two cannot drift. If the two really are independent roles that merely
 *    agree today, declare it in INDEPENDENT_ROLES with a reason — that list is
 *    capped and may only shrink.
 * 4. Anything scoped to one feature belongs in that component's own CSS as a
 *    local variable, not here. The exception is a colour this test file asserts
 *    contrast on: those stay, because a token outside the gate is a token that
 *    silently rots (--app-sidebar-chevron shipped at 2.07:1).
 *
 * This contract is SHARED between the standalone Pikku console and the consoles
 * built on top of it. Both ship the same palette on purpose — a host that must
 * diverge on a token passes it to `createCssVariablesResolver` rather than
 * forking this file, so the rules above keep applying to whatever it renders.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  /* Nothing is scheme-independent. The one group that lived here, --app-fabric-*,
   * was overridden by BOTH scheme blocks and so could never render. */
  variables: {},
  dark: {
    '--mantine-color-body': 'var(--app-page-bg)',
    /* Mantine's own dimmed grey is the single most-used text colour in the app
     * (346 `c="dimmed"` call sites) and it is NOT ours — #868e96 measures 3.32:1
     * on light panels, so Rule 1 was satisfied by this file and broken by the app.
     * Rather than lint 346 call sites, the bypass channel is pulled into the
     * contract: dimmed IS --app-text-dim. */
    '--mantine-color-dimmed': 'var(--app-text-dim)',
    /* Mantine's own blue/primary fills are the other bypass channel: filled
     * buttons render #228be6 with a white label = 3.56:1, measured in the
     * browser on the two primary CTAs. Same treatment as dimmed — point them
     * at our accent so `color="blue"` lands inside the contract. */
    '--mantine-color-blue-filled': 'var(--app-accent-strong)',
    '--mantine-color-blue-filled-hover': 'var(--app-primary-button-hover)',
    '--mantine-color-primary-filled': 'var(--app-accent-strong)',
    '--mantine-color-primary-filled-hover': 'var(--app-primary-button-hover)',

    /* Core neutrals — one cool axis (OKLCH hue 262, chroma 0.010). Page and panel
     * share the hue so layered surfaces read as one system; steps are >=2.4 L* so
     * each level is actually visible. The ramp tops out at L*17 deliberately: any
     * lighter and the dimmed text ramp below stops clearing AA on it. */
    '--app-page-bg': '#07080d',
    '--app-page-bg-alt': '#101217',
    '--app-panel-bg': '#16181d',
    '--app-panel-bg-raised': '#1d2024',
    '--app-panel-bg-soft': '#23252a',
    '--app-panel-bg-strong': '#282a30',
    /* Borders split by JOB, not by weight. `border`/`border-hover` are decorative
     * dividers and are exempt from WCAG 1.4.11. `border-control`/`border-strong`
     * draw CONTROL boundaries (inputs, buttons, checkboxes) and must clear 3:1 on
     * every panel level — verified: control 3.72/3.01, strong 4.86/3.92. Do not
     * use `border` on an interactive control. */
    '--app-border': '#3a3d44',
    '--app-border-hover': '#4d5157',
    '--app-border-control': '#6e737b',
    '--app-border-strong': '#818690',
    '--app-text': '#e8e8e8',
    /* Dimmed text ramp — verified >=4.5:1 on every background it lands on, worst
     * case on --app-panel-bg-strong: dim 5.89, faint 5.10. Monotonic by name:
     * text > dim > faint. Reserve sub-4.5:1 grays for dividers, not text. */
    '--app-text-dim': '#a6a6a6',
    '--app-text-faint': '#9a9a9a',
    /* Text on an INVERTED surface — a label sitting on an accent/red/primary fill,
     * not a step of the dimmed ramp above. It briefly carried a third "dimmed" gray
     * (#8e8e8e) and a deprecation notice; the notice outlived the value. Migrating a
     * call site to --app-text-faint puts gray text on a saturated fill. */
    '--app-text-inverse': '#ffffff',
    /* Status surfaces at L*~20 / chroma ~0.05 so the tint is actually legible as a
     * tint. Each is verified against its paired foreground: danger 4.77, warning
     * 7.89, info 5.17, success 6.78, violet 4.82. */
    '--app-surface-danger': '#482725',
    '--app-surface-danger-soft': '#3e1f1c',
    '--app-surface-warning': '#3f2d11',
    '--app-surface-warning-alt': '#372508',
    '--app-surface-info': '#1b3248',
    '--app-surface-success': '#183724',
    '--app-surface-violet': '#342c48',
    '--app-surface-accent': '#1b3248',
    '--app-surface-interactive': '#1f2838',
    '--app-surface-interactive-strong': '#243149',

    /* Glass effect */
    '--app-glass-border': 'rgba(255,255,255,0.1)',

    /* Surfaces. NOTE: a translucent white fill can never carry an input boundary on
     * dark — even at alpha 0.11 it only reaches 1.34:1 against the panel. The fill
     * is aesthetic; --app-border-control is what makes the field findable. */
    '--app-input-bg': 'rgba(255,255,255,0.05)',
    /* Same colour as the panel by definition — aliased so they cannot drift. */
    '--app-surface': 'var(--app-panel-bg)',

    /* Glow / accent */
    '--app-shadow-panel': '0 18px 40px rgba(0, 0, 0, 0.24)',
    '--app-shadow-panel-strong': '0 18px 40px rgba(0, 0, 0, 0.28)',
    '--app-shadow-sm': '0 2px 8px rgba(0,0,0,0.3)',
    /* Dark's hover lift is a deeper cast, not a bigger one: on a near-black page
     * a wider blur has nothing to fall on, so the answer to the pointer is
     * density. Paired with the border change at the call site. */
    '--app-shadow-panel-hover': '0 8px 24px rgba(0, 0, 0, 0.38)',

    /* Step indicators */

    /* Semantic colors */
    '--app-accent': '#60a5fa',
    '--app-accent-strong': '#2563eb',
    '--app-accent-alt': '#3b82f6',
    '--app-accent-hover': '#93c5fd',
    /* Paired label for a fill of --app-accent-hover. Hover brightens in dark and
     * darkens in light, so a hardcoded white label is legible in exactly one of
     * the two schemes — it measured 1.80:1 on dark hover. The pair is a token. */
    '--app-accent-hover-fg': '#07080d',
    '--app-accent-secondary': '#1d4ed8',
    '--app-accent-secondary-hover': '#3b82f6',
    /* Was #0052cc/#0065ff — Atlassian blues, a different design language from the
     * Tailwind-family accent used everywhere else, and the two were mixed inside a
     * single button (EntityCard.tsx:505 vs :509). Aliased onto the accent so there
     * is ONE blue family; also means mono accent mode neutralizes them for free. */
    '--app-primary-button-bg': 'var(--app-accent-strong)',
    /* Not --app-accent-alt: that brightens far enough that the white label drops
     * to 3.68:1. This is the lightest blue the button's own label survives. */
    '--app-primary-button-hover': '#336fe4',
    '--app-primary-button-fg': '#ffffff',
    /* Disabled must READ disabled: the old fg (#e8e8e8) measured 12.67:1, higher
     * than most enabled body text, so disabled providers looked active. */
    /* Aliases onto the accent family. There were 19 blue token names resolving to
     * only 11 distinct hexes, across two unrelated design languages. One family. */
    '--app-blue': 'var(--app-accent)',
    '--app-blue-strong': 'var(--app-accent-strong)',
    '--app-blue-hover': 'var(--app-accent-hover)',
    '--app-blue-border': '#1a2a4a',
    '--app-green': '#34d399',
    '--app-green-bright': '#4ade80',
    '--app-green-border': '#1a4a30',
    '--app-amber': '#fbbf24',
    '--app-amber-strong': '#f59e0b',
    '--app-amber-deep': '#f97316',
    '--app-amber-border': '#3a2e00',
    '--app-violet': '#a78bfa',
    '--app-violet-border': '#2a1a4a',
    '--app-red': '#f87171',
    '--app-red-border': '#4a1a1a',
    '--app-red-border-soft': 'rgba(220, 38, 38, 0.2)',
    '--app-gray-dot': '#4d5157',
    /* These four render TEXT, so they clear AA (4.75 worst case) rather than sitting
     * at the old 2.95–4.45 where they failed on every background. */
    '--app-gray-sidebar': '#8b95a6',
    '--app-sidebar-text': '#8b95a6',
    '--app-sidebar-text-muted': '#8792a3',
    '--app-sidebar-text-soft': '#a6afbf',
    '--app-sidebar-text-strong': '#ffffff',
    '--app-sidebar-text-parent': '#d7dde8',
    '--app-sidebar-text-selected': '#e8f2ff',
    '--app-sidebar-hover': '#181e27',
    '--app-sidebar-active': '#1f252f',
    '--app-sidebar-chevron': '#778295',

    /* Third status vocabulary (1 usage total, vs 164 for --app-red/green/amber).
     * Aliased rather than duplicated so it cannot drift from the one that won. */

    /* Error */

    /* Log level colors */
    /* Severity must be distinguishable BY COLOR — info and debug were both #60a5fa,
     * so the two most common levels were indistinguishable. Debug/trace now step
     * down the neutral ramp instead of competing with info's accent blue. */
  },
  light: {
    '--mantine-color-body': 'var(--app-page-bg)',
    /* Mantine's own dimmed grey is the single most-used text colour in the app
     * (346 `c="dimmed"` call sites) and it is NOT ours — #868e96 measures 3.32:1
     * on light panels, so Rule 1 was satisfied by this file and broken by the app.
     * Rather than lint 346 call sites, the bypass channel is pulled into the
     * contract: dimmed IS --app-text-dim. */
    '--mantine-color-dimmed': 'var(--app-text-dim)',
    /* Mantine's own blue/primary fills are the other bypass channel: filled
     * buttons render #228be6 with a white label = 3.56:1, measured in the
     * browser on the two primary CTAs. Same treatment as dimmed — point them
     * at our accent so `color="blue"` lands inside the contract. */
    '--mantine-color-blue-filled': 'var(--app-accent-strong)',
    '--mantine-color-blue-filled-hover': 'var(--app-primary-button-hover)',
    '--mantine-color-primary-filled': 'var(--app-accent-strong)',
    '--mantine-color-primary-filled-hover': 'var(--app-primary-button-hover)',

    /* Core neutrals — same cool axis as dark (OKLCH hue 262), with chroma rising
     * as the surface darkens, the way tinted paper behaves.
     *
     * ORDER MATTERS AND IT IS NOT THE DARK BLOCK'S ORDER. Every panel step sits
     * ABOVE the page ground in lightness, so a panel can never recede below the
     * page it floats on. The previous values had panel-bg-soft (L*96.0) and
     * -strong (L*93.6) BELOW page-bg (L*96.4): a "raised" surface rendered as a
     * hole. That is what deriving light from dark by inverting the ramp gets you.
     *
     * The ladder is deliberately shallow (95.2–100). Light mode does not get its
     * depth from tone — it gets it from the shadow and the hairline below, which
     * is why those are layered here and flat in dark. Widening this ramp instead
     * would drag every text token down with it: the DARKEST surface in this list
     * is what binds all of them, and dragging it down is what made the semantic
     * colours muddy. */
    '--app-page-bg': '#eceff5',
    '--app-page-bg-alt': '#e7ebf3',
    '--app-panel-bg': '#ffffff',
    '--app-panel-bg-raised': '#fafbfe',
    '--app-panel-bg-soft': '#f5f7fb',
    '--app-panel-bg-strong': '#f0f3f9',
    /* Split by JOB, mirroring the dark block. border/-hover are decorative
     * dividers (exempt from 1.4.11); control/strong draw control boundaries and
     * clear 3:1 on every surface above — verified: control 3.75/3.07,
     * strong 4.63/3.79. `border` is deliberately heavier than a hairline needs to
     * be (1.44:1 on white, was 1.40): on a light page the card edge is what
     * separates the card, and it was losing that argument to the input borders
     * inside it. */
    '--app-border': '#d2d7e0',
    '--app-border-hover': '#bec4cf',
    '--app-border-control': '#7f858f',
    '--app-border-strong': '#707681',
    /* Ink, not black — carries the same hue as the surfaces (chroma 0.006) so it
     * sits on them instead of on top of them. Pure #111111 on a hue-262 panel is
     * the one pairing that reads as dirt. */
    '--app-text': '#202225',
    /* Dimmed ramp — AA on every surface INCLUDING the sidebar ones, and now
     * actually distinguishable: dim/faint were 3.3 L* apart (7.11 vs 6.19 on
     * white), which is two names for one grey. They are 6.9 apart now. */
    '--app-text-dim': '#51545a',
    '--app-text-faint': '#64686f',
    /* Text on an inverted surface — see the dark block. Same value in both schemes:
     * an accent fill is dark in either, so its label is white either way. */
    '--app-text-inverse': '#ffffff',
    /* Status tints, at roughly 3x the chroma they used to carry. The old set sat
     * at chroma 0.011–0.026 and 1.2–3.3 L* off white — close enough to white that
     * a warning banner read as a smudge rather than as yellow. Each is still high
     * enough in L* that its paired semantic text clears AA on it (worst: accent on
     * -interactive-strong, 4.61).
     *
     * -accent is BLUE here, not pink. It was #faf5ff (OKLCH hue 308) in light and
     * a blue #1b3248 in dark: one token, two hue families, so the same component
     * changed colour identity with the scheme. -info and -interactive were also
     * byte-identical (#f0f5ff) with no alias tying them together. */
    '--app-surface-danger': '#feedec',
    '--app-surface-danger-soft': '#fef4f3',
    '--app-surface-warning': '#feefde',
    '--app-surface-warning-alt': '#fef3dd',
    '--app-surface-info': '#eaf2fe',
    '--app-surface-success': '#ddfae6',
    '--app-surface-violet': '#f2effe',
    '--app-surface-accent': '#e4edfe',
    '--app-surface-interactive': '#f1f6fe',
    '--app-surface-interactive-strong': '#dce8fd',

    /* Glass effect */
    '--app-glass-border': 'rgba(0,0,0,0.08)',

    /* Surfaces */
    '--app-input-bg': 'rgba(0,0,0,0.03)',
    /* Same colour as the panel by definition — aliased so they cannot drift. */
    '--app-surface': 'var(--app-panel-bg)',

    /* Shadows carry the elevation the surface ramp deliberately does not. Two
     * layers, not one: a 1px contact shadow that anchors the card to the page and
     * a wide soft cast that lifts it. The single 0.06-alpha blur they replace was
     * invisible on a tinted page, which left a 1.4:1 border as the only thing
     * telling a card from its background. Tinted toward the surface hue rather
     * than neutral black, so the shade belongs to the same light. */
    '--app-shadow-panel':
      '0 1px 2px rgba(20, 26, 44, 0.06), 0 6px 16px -4px rgba(20, 26, 44, 0.10)',
    '--app-shadow-panel-strong':
      '0 2px 4px rgba(20, 26, 44, 0.07), 0 14px 32px -8px rgba(20, 26, 44, 0.16)',
    '--app-shadow-sm': '0 1px 2px rgba(20, 26, 44, 0.10)',
    /* The hover lift. A card answers the pointer by casting further, not by
     * moving: a transform slides the card out from under the cursor it is
     * responding to, and on a grid it shifts one tile against its neighbours. */
    '--app-shadow-panel-hover': '0 6px 20px rgba(20, 26, 44, 0.16)',

    /* Step indicators */

    /* Semantic colors */
    /* These were ink (#111111/#2c2c2c/#333333/#444444) while the dark scheme used
     * blues for the same names — so a component styled with --app-accent-strong
     * rendered blue in dark and near-black in light. Same token, opposite meaning
     * per scheme, with nothing to catch it. accent-* now means accent in BOTH
     * schemes; if a surface wants ink in light mode it needs its own token. */
    /* TWO TIERS, and which one a token belongs to decides what it may render.
     *
     *   TEXT tier   --app-accent/-strong/-hover, red, green, amber, violet.
     *               Words. AA (>=4.5:1) on every surface, and as chromatic as
     *               that allows — about 85% of the in-gamut ceiling at that
     *               lightness. They used to be tuned to one shared contrast
     *               (5.97–6.02 on white, all at L*~51), which is why nothing in
     *               light mode looked more urgent than anything else.
     *
     *   GRAPHIC tier  -alt, -bright, amber-strong, amber-deep. Dots, bars, chart
     *               series, icons — never words. WCAG 1.4.11 governs them at 3:1,
     *               which buys the chroma the text tier cannot have.
     *
     * The tier split is not a preference. On white, no hue-70 colour clears 4.5:1
     * and still reads as amber — the most chromatic one that does is #8c5800,
     * which is brown. So warning in light mode is carried by the FILL
     * (--app-surface-warning + --app-text) with the amber only as the mark. */
    '--app-accent': '#1e5fe0',
    '--app-accent-strong': '#1553ce',
    '--app-accent-alt': '#2268f1',
    '--app-accent-hover': '#1349b3',
    '--app-accent-hover-fg': '#ffffff',
    '--app-accent-secondary': '#2d5e8d',
    '--app-accent-secondary-hover': '#346ea6',
    '--app-primary-button-bg': 'var(--app-accent-strong)',
    /* Literal, not an alias of --app-accent-hover: this is its own role now, bound
     * by the label that sits on it (see FILL_PAIRS in theme-contract.test.ts). */
    '--app-primary-button-hover': '#1349b3',
    '--app-primary-button-fg': '#ffffff',
    '--app-blue': 'var(--app-accent)',
    '--app-blue-strong': 'var(--app-accent-strong)',
    '--app-blue-hover': 'var(--app-accent-hover)',
    '--app-blue-border': '#c9dcfd',
    '--app-green': '#267649',
    /* Graphic tier. It was #10b981 — 2.54:1 on white, so a metric value rendered
     * with it (lib/metricsColumns.tsx, WelcomePage.tsx) was legible in dark and
     * nearly invisible in light. 3.86:1 now, which is a mark, still not a word. */
    '--app-green-bright': '#219458',
    '--app-green-border': '#b6ecc7',
    /* Bronze, and honestly so: see the tier note above. */
    '--app-amber': '#8b5f20',
    '--app-amber-strong': '#b6791a',
    '--app-amber-deep': '#c55f1d',
    '--app-amber-border': '#fdd7a8',
    '--app-violet': '#7c3ee0',
    '--app-violet-border': '#ddd4fd',
    '--app-red': '#bd3435',
    '--app-red-border': '#fdcec9',
    '--app-red-border-soft': 'rgba(220, 38, 38, 0.15)',
    /* Cool, on the hue-262 axis. #dbdbd9 was warm stone (hue 106) — the exact
     * temperature the neutrals note above says was purged; it survived here. */
    '--app-gray-dot': '#b8bec8',
    '--app-gray-sidebar': '#575b61',
    '--app-sidebar-text': '#55595e',
    '--app-sidebar-text-muted': '#60636a',
    '--app-sidebar-text-soft': '#45484d',
    '--app-sidebar-text-strong': '#202225',
    '--app-sidebar-text-parent': '#2e3034',
    /* Its own role, not an alias of accent: it is bound by legibility on
     * --app-sidebar-active, which accent is not. */
    '--app-sidebar-text-selected': '#1550c2',
    '--app-sidebar-hover': '#e9edf5',
    /* Selection is a TINT, not a deeper step of grey. That is not decoration: the
     * darkest surface in this scheme binds the contrast of EVERY text token, and
     * the old #e2e5e9 (L*92.1) was that surface. Carrying selection as blue at
     * L*93.8 lifts the floor, which is what let the semantic colours above take
     * more chroma while still clearing AA here. */
    '--app-sidebar-active': '#e1ebfe',
    '--app-sidebar-chevron': '#7b808a',

    /* Error */

    /* Log level colors */
  },
})

/**
 * The contract with per-token substitutions layered on top.
 *
 * Rule 3 forbids a second NAME for a colour; this is the supported way for a
 * host to give an existing name a different VALUE. The overrides are merged
 * after the shared block, so anything not named keeps the contract's value and
 * a host can never drift by omission. Nothing overrides today — the standalone
 * console and Fabric ship the same palette — and the moment something does, it
 * is one visible object at the call site rather than a forked file.
 */
export const createCssVariablesResolver = (overrides?: {
  variables?: Record<string, string>
  dark?: Record<string, string>
  light?: Record<string, string>
}): CSSVariablesResolver => {
  return (theme) => {
    const base = cssVariablesResolver(theme)
    return {
      variables: { ...base.variables, ...overrides?.variables },
      dark: { ...base.dark, ...overrides?.dark },
      light: { ...base.light, ...overrides?.light },
    }
  }
}

export const appColorVars = {
  pageBg: 'var(--app-page-bg)',
  pageBgAlt: 'var(--app-page-bg-alt)',
  panelBg: 'var(--app-panel-bg)',
  panelBgRaised: 'var(--app-panel-bg-raised)',
  border: 'var(--app-border)',
  borderHover: 'var(--app-border-hover)',
  borderStrong: 'var(--app-border-strong)',
  text: 'var(--app-text)',
  textDim: 'var(--app-text-dim)',
  textFaint: 'var(--app-text-faint)',
  textInverse: 'var(--app-text-inverse)',
  accent: 'var(--app-accent)',
  accentStrong: 'var(--app-accent-strong)',
  green: 'var(--app-green)',
  greenBright: 'var(--app-green-bright)',
  blue: 'var(--app-blue)',
  amber: 'var(--app-amber)',
  red: 'var(--app-red)',
  violet: 'var(--app-violet)',
  violetBorder: 'var(--app-violet-border)',
  surfaceViolet: 'var(--app-surface-violet)',
  grayDot: 'var(--app-gray-dot)',
} as const

export const theme = createTheme({
  primaryColor: 'blue',
  colors: { emerald, primary, secondary, dark },
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, monospace',
  headings: {
    fontFamily: 'JetBrains Mono, monospace',
  },
  defaultRadius: 'md',
  components: {
    Paper: {
      defaultProps: {
        radius: 'lg',
      },
      styles: {
        root: {
          background: 'var(--app-panel-bg)',
          borderColor: 'var(--app-border)',
          boxShadow: 'var(--app-shadow-panel)',
        },
      },
    },
    Button: {
      defaultProps: {
        size: 'sm',
      },
      styles: {
        root: {
          fontWeight: 600,
        },
      },
    },
    TextInput: {
      styles: {
        input: {
          backgroundColor: 'var(--app-panel-bg)',
          borderColor: 'var(--app-border-control)',
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 13,
        },
        label: {
          color: 'var(--app-text-dim)',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.5px',
          marginBottom: 6,
        },
      },
    },
    PasswordInput: {
      styles: {
        input: {
          backgroundColor: 'var(--app-panel-bg)',
          borderColor: 'var(--app-border-control)',
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 13,
        },
        innerInput: {
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 13,
        },
        label: {
          color: 'var(--app-text-dim)',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.5px',
          marginBottom: 6,
        },
      },
    },
    Textarea: {
      styles: {
        input: {
          backgroundColor: 'var(--app-panel-bg)',
          borderColor: 'var(--app-border-control)',
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 12,
        },
      },
    },
    Select: {
      styles: {
        input: {
          backgroundColor: 'var(--app-panel-bg)',
          borderColor: 'var(--app-border-control)',
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 13,
        },
        dropdown: {
          backgroundColor: 'var(--app-panel-bg)',
          borderColor: 'var(--app-border)',
        },
        option: {
          fontSize: 13,
        },
        label: {
          color: 'var(--app-text-dim)',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.5px',
          marginBottom: 6,
        },
      },
    },
    NativeSelect: {
      styles: {
        input: {
          backgroundColor: 'var(--app-panel-bg)',
          borderColor: 'var(--app-border-control)',
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 13,
        },
        label: {
          color: 'var(--app-text-dim)',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.5px',
          marginBottom: 6,
        },
      },
    },
    Tabs: {
      styles: {
        tab: {
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 12,
          fontWeight: 600,
        },
      },
    },
    Chip: {
      styles: {
        label: {
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 12,
          backgroundColor: 'var(--app-panel-bg)',
          borderColor: 'var(--app-border-control)',
        },
      },
    },
    SegmentedControl: {
      styles: {
        root: {
          backgroundColor: 'var(--app-panel-bg-strong)',
          border: '0.5px solid var(--app-border-control)',
        },
        label: {
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 12,
          fontWeight: 500,
        },
      },
    },
    Accordion: {
      styles: {
        item: {
          background: 'var(--app-panel-bg)',
          borderColor: 'var(--app-border)',
          borderRadius: 'var(--mantine-radius-lg)',
        },
        // Controls carry human titles (sentence case), not taxonomic labels —
        // so inherit the body font and full text color; don't uppercase or mono.
        control: {
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--app-text)',
        },
        content: {
          padding: 0,
        },
      },
    },
    Stepper: {
      styles: {
        stepIcon: {
          backgroundColor: 'var(--app-panel-bg)',
          borderColor: 'var(--app-border-control)',
        },
        stepLabel: {
          fontFamily: 'var(--mantine-font-family-monospace)',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.5px',
        },
        separator: {
          backgroundColor: 'var(--app-border)',
        },
      },
    },
    Dropzone: {
      styles: {
        root: {
          backgroundColor: 'var(--app-panel-bg)',
          borderColor: 'var(--app-border-control)',
          borderStyle: 'dashed',
          minHeight: 140,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        },
      },
    },
  },
})

// Mantine's styles.css sets Alert.message color via :where([data-mantine-color-scheme='dark'])
// with zero specificity. When the root provider sets dark on <html>, that rule always wins over
// the light rule — both have equal specificity and dark comes last in the file. Using
// var(--mantine-color-text) as a component style override wins by cascade ordering (injected
// after styles.css), and it adapts to whichever color scheme the nearest provider declares.
export const lightPanelTheme = mergeThemeOverrides(theme, {
  components: {
    Alert: {
      styles: {
        message: { color: 'var(--mantine-color-text)' },
      },
    },
  },
})
