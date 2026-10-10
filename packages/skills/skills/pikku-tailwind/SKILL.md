---
name: pikku-tailwind
description: >-
  Use when building a Tailwind + shadcn/ui interface on top of a Pikku backend — rendering dates that
  came back from a generated client, keeping layout flow-relative so the app survives an RTL locale,
  branching on colour scheme without hardcoding a shade, and choosing components. TRIGGER when:
  putting a value from usePikkuQuery or an RPC response on screen, writing margins/padding/alignment
  classes, choosing a date input or any shadcn component, handling light/dark, or fixing a
  `@shadcn/lint` error. DO NOT TRIGGER when: the data does not come from a Pikku client (this is only
  about what the generated clients hand you), or for user-facing copy (use pikku-i18n).
installGroups: [client]
---

# Tailwind and shadcn/ui on a Pikku client

The UI is Tailwind v4 utility classes over shadcn/ui components that live in the app's own
`src/components/ui/`. They are source you edit, not a dependency you configure. Every colour, radius
and font comes from CSS variables in the app's `theme.css`; change the look with `pikku ui theme apply`.

## Components

- Use the shadcn component for the job (`Button`, `Input`, `Select`, `Sheet`, `Table`, `Tabs`,
  `Calendar`) before writing markup. Compose it with utility classes for layout.
- Need a size or look the component lacks? Add a `variant` or `size` to the component file with
  `cva`, then use it. Do not restyle one instance with a pile of classes.
- A raw `<div onClick>` or `<span role="button">` gets none of Radix's keyboard and ARIA handling.
  Use `Button`, `Toggle` or the matching primitive.
- Merge classes with `cn()` from `@/lib/utils`, never string concatenation.
- Forms take a visible `<Label htmlFor>` on every input; a placeholder is not a label.

## Lint

`@shadcn/lint` runs in ESLint/Oxlint and fails the build. It reads the app's components, variants and
theme, and every error names what to use instead. Fix the cause the message points at:

- an arbitrary value (`w-[313px]`, `bg-[#2F5D62]`) → a spacing step or a theme token
- a raw palette class (`bg-blue-500`, `text-gray-400`) → a semantic token (`bg-primary`,
  `text-muted-foreground`)
- a missing variant → add it to the component, then use it

Never silence a rule with a disable comment to get past it.

## Dates — always format before rendering

The generated clients run `transformDates`, which revives **fully-zoned ISO-8601 instants** —
`2026-03-14T08:12:00Z`, `2026-03-14T08:12:00.000+01:00` — into `Date` objects and touches nothing
else. A bare `2026-03-14`, a zoneless `2026-03-14T08:12:00` and an impossible `2026-02-31T00:00:00Z`
all stay the strings the server sent. So a field's runtime type follows the VALUE, not the schema:
one column can arrive as a `Date` from one row and a string from the next.

Two consequences, and both compile:

- **A string method on one white-screens the page.** `row.createdAt.split('T')[0]` type-checks
  against nothing useful and blows up at runtime. There is no string to slice.
- **A raw `Date` dropped into JSX crashes the route.** `<span>{row.createdAt}</span>`, a table cell,
  a `<Badge>` — React throws `Objects are not valid as a React child (found: [object Date])` and the
  page falls into its error boundary. Nothing catches it before the screen is white, which makes it
  the most common broken page in a build.

**Format with dayjs.** It takes either a `Date` or a string. Never `toLocaleDateString`, `date-fns`
or `luxon`.

```tsx
import dayjs from 'dayjs'

<span>{dayjs(row.dueOn).format('D MMM YYYY')}</span>
<span>{dayjs(row.createdAt).format('D MMM YYYY, HH:mm')}</span>
```

A relative "2 days ago" via dayjs `relativeTime` is fine. Coercing instead of formatting
(`` `${d}` ``, `String(d)`, `d + ''`) does not crash but prints
`Mon Jun 15 2026 02:00:00 GMT+0200` — a different bug, equally wrong.

Date **inputs** are the shadcn `Calendar` inside a `Popover` (the date-picker recipe), never a raw
`<input type="date">`. A calendar is not a schedule: there is no week/time-grid component, so a
diary, rota, timetable or booking week is a grid you build. `Calendar` with a custom day cell IS
right for "a few things on each day of a month", like a content calendar or a holiday planner.

All of this applies to stub and fixture dates exactly as it does to real data.

## RTL-safe styles

Write layout classes flow-relative so the UI works in both LTR and RTL languages. Pikku's i18n ships
Arabic, Hebrew, Farsi and Urdu support, and a physical margin is what breaks under it.

| Avoid                    | Use instead                 |
| ------------------------ | --------------------------- |
| `ml-*`, `mr-*`           | `ms-*`, `me-*`              |
| `pl-*`, `pr-*`           | `ps-*`, `pe-*`              |
| `left-*`, `right-*`      | `start-*`, `end-*`          |
| `text-left`, `text-right`| `text-start`, `text-end`    |
| `border-l`, `border-r`   | `border-s`, `border-e`      |
| `rounded-l`, `rounded-r` | `rounded-s`, `rounded-e`    |
| `flex-row-reverse`       | the `dir` attribute         |

Directional icons (chevrons, arrows) flip with `rtl:rotate-180`.

## Dark mode

Colours come from semantic tokens that already change per scheme: `bg-background`,
`text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`. They need no `dark:` prefix.
Use a `dark:` variant only to pick between two theme tokens, never to introduce a literal colour or a
palette shade for one scheme.

```tsx
// Correct
<div className="bg-background text-foreground">

// Wrong — scheme branch with hardcoded palette shades
<div className="bg-gray-50 dark:bg-zinc-900">
```
