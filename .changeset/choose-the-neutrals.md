---
'@pikku/skills': patch
---

Name the neutrals, the attractors, and what the seed has to show.

Three gaps found by building an app through this skill and then holding it
against the design it was meant to be.

The neutrals are never chosen. The theme JSON carries `brand` and `structure`
and no neutral field, so every app runs its accent on Mantine's grey ramp, which
is blue-biased. If the accent is not itself blue the mismatch lands on every
screen at once — warm content ruled off in cold lines — and it survives a
critique because no single screen is broken. `theming.md` now says to bias the
whole ramp, keeping Mantine's lightness steps so contrast behaviour is
unchanged. That file's own example was part of the problem: it set the hairline
to `var(--mantine-color-gray-2)`, the exact cool grey the new section warns
about.

Mantine's `cssVariablesResolver` injects its own `:root` block at runtime, after
the app's stylesheet, and wins on source order. A plain `:root` override is
silently reverted: the file reads correct, the app renders the defaults, nothing
errors. Documented, with the tripled selector that beats it.

"Be ambitious" is encouragement, not a constraint, so `design.md` names the
attractors instead — stock Mantine first, since untouched defaults do not look
broken, they look finished, and an app can be entirely default without tripping
a single symptom.

And the gate needs something to look at: a screenshot is only evidence if the
screen has data on it, and anything derived from today is seeded as an interval
from `now` rather than a fixed date that decays.
