---
'@pikku/console': patch
'@pikku/mantine': patch
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/kysely': patch
'@pikku/addon-admin': patch
'@pikku/addon-console': patch
---

The console shows feature flags as a launch board, and analytics events as a
declared catalog.

A flag's state is four fields — `enabled`, `rolloutPercent`, `declared`,
`backed` — and none of them is the question an operator actually asks, which is
how far this has got. The board answers that directly: every declared flag sits
in the lane its rollout has reached, `dark` → `rolling` → `live`, with
`attention` for the flags that are not resolving in a way anybody chose.

Attention is evaluated before every other reading, and that ordering is the
whole point rather than an implementation detail. A flag declared in code with
no row in the store fails open, and it reports `enabled: true` with no rollout
limit — byte-identical to a deliberate full launch. Read the fields in the
obvious order and the one production-severity state on the board renders as the
healthiest one. `groupFlagsByLane` also returns all four lanes whether or not
they hold anything, because a board read by shape must not rearrange itself the
moment a lane empties.

Selecting a flag opens its controls beside the board rather than over it: the
switch, the rollout bucket, and the subjects pinned on or off past that bucket.
They share one surface because they are read together — "off for everyone except
these three" is a switch and an override row, and an operator who has to leave
one screen to see the other is the operator who turns a flag on for everybody by
mistake. The panel tracks the open flag by name and re-reads it from the list, so
committing a rollout moves the card and the panel together instead of leaving the
panel describing the flag as it was before the operator changed it.

A board whose flags come from a `FeatureFlagSource` — a provider Pikku reads but
does not own — says so and offers no controls, rather than offering controls that
would fail.

The analytics screen is a catalog of what the code declares, read from build-time
meta: the events a client may emit and the props each carries, with every prop
rendered as the schema source text the declaration wrote. It is deliberately not
a volume report — nothing here counts what was emitted — and saying which of the
two it is turned out to be the only design question the screen had.

Turning a flag on while it carries no rollout limit now asks first. That press
is the one irreversible thing the board can do — with no bucket left to hold
anybody back it admits everyone the flag's capabilities allow — and it used to
be a single click on a switch. The panel also reports what a mutation is doing
and what it refused to do: the controls it is waiting on go into a pending
state, and a failed write raises an inline `<Alert>` rather than reverting in
silence. The console mounts no notification provider, so the feedback is inline
where the action is, which is the idiom the rest of the console already uses.

`@pikku/mantine`'s theme gains four aliases, and they close a contrast defect
that predates this board:

```ts
'--mantine-color-orange-light': 'var(--app-surface-warning)',
'--mantine-color-orange-light-color': 'var(--app-amber)',
'--mantine-color-teal-light': 'var(--app-surface-success)',
'--mantine-color-teal-light-color': 'var(--app-green)',
```

The theme already documents two colour tiers — TEXT must clear AA, GRAPHIC only
3:1 — and already pulls Mantine's own variables into that contract rather than
linting call sites. What it had not covered was Mantine's _light variants_:
`<Alert color="orange">` renders #d9480f on #ffe8cc at 3.62:1, and
`<Badge variant="light" color="teal">` at 4.33:1, neither reachable from an
`--app-*` token because the component never asks for one. The ramp itself is
deliberately untouched: Mantine conflates `--mantine-color-orange-filled`
between `c="orange"` text and a `variant="filled"` background, so darkening it
for light-mode text would make an existing filled badge unreadable in dark mode.
Eight pre-existing `c="orange"` call sites moved onto the amber TEXT tier in the
same pass.

The analytics catalog is grouped by the file that declares each event, and its
rows are real buttons rather than table cells carrying a tabindex.

`ShellHeaderAction` gains `loading` and `testId`, and `ActionCluster` gains a
`measurement` flag. `ShellHeader` sizes its actions by rendering them a second
time off-screen, and that measuring copy was carrying the same `data-testid` and
`data-help` as the real one — so every action on a page with a collapsing header
resolved to two elements. The flags board also moved its two header actions from
`actionsNode` (documented as the non-collapsing escape hatch) onto the structured
`actions` array, which is what stopped them clipping off the right edge at 400px.
