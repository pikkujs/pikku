---
name: pikku-mantine
description: >-
  Use when building a Mantine UI on top of a Pikku backend — rendering dates that came back from a
  generated client, keeping layout flow-relative so the app survives an RTL locale, and branching on
  colour scheme without hardcoding a shade. TRIGGER when: putting a value from usePikkuQuery or an
  RPC response on screen, writing margins/padding/alignment in Mantine props or CSS, choosing a date
  input, or handling light/dark. DO NOT TRIGGER when: the data does not come from a Pikku client
  (this is only about what the generated clients hand you), or for user-facing copy (use pikku-i18n).
installGroups: [client]
---

# Mantine on a Pikku client

## Dates — always format before rendering

The generated clients run `transformDates`, which revives **fully-zoned ISO-8601 instants** —
`2026-03-14T08:12:00Z`, `2026-03-14T08:12:00.000+01:00` — into `Date` objects and touches nothing
else. A bare `2026-03-14`, a zoneless `2026-03-14T08:12:00` and an impossible `2026-02-31T00:00:00Z`
all stay the strings the server sent. So a field's runtime type follows the VALUE, not the schema:
one column can arrive as a `Date` from one row and a string from the next.

Two consequences, and both compile:

- **A string method on one white-screens the page.** `row.createdAt.split('T')[0]` type-checks
  against nothing useful and blows up at runtime. There is no string to slice.
- **A raw `Date` dropped into JSX crashes the route.** `<Text>{row.createdAt}</Text>`, a table cell,
  a `<Badge>` — React throws `Objects are not valid as a React child (found: [object Date])` and the
  page falls into its error boundary. Nothing catches it before the screen is white, which makes it
  the most common broken page in a build.

**Format with dayjs.** It is Mantine's own date library, already shipped alongside `@mantine/dates`,
and it takes either a `Date` or a string. Never `toLocaleDateString`, `date-fns` or `luxon`.

```tsx
import dayjs from 'dayjs'

<Text>{dayjs(row.dueOn).format('D MMM YYYY')}</Text>        // 15 Jun 2026
<Text>{dayjs(row.createdAt).format('D MMM YYYY, HH:mm')}</Text>
```

A relative "2 days ago" via dayjs `relativeTime` is fine. Coercing instead of formatting
(`` `${d}` ``, `String(d)`, `d + ''`) does not crash but prints
`Mon Jun 15 2026 02:00:00 GMT+0200` — a different bug, equally wrong.

Date **inputs** are `@mantine/dates` — `DatePickerInput`, `DatePicker`, `Calendar` — never a raw
`<TextInput type="date">`. Those are pickers and they are not a schedule: Mantine ships no
week/time-grid component, so a diary, rota, timetable or booking week is a grid you build, not a
`Calendar` with the time-of-day left out. `Calendar` with `renderDay` IS right for "a few things on
each day of a month", like a content calendar or a holiday planner.

All of this applies to stub and fixture dates exactly as it does to real data.

## RTL-safe styles

Write layout styles flow-relative so the UI works in both LTR and RTL languages. Pikku's i18n ships
Arabic, Hebrew, Farsi and Urdu support, and a physical margin is what breaks under it.

| Avoid                         | Use instead                                |
| ----------------------------- | ------------------------------------------ |
| `ml`, `mr`, `pl`, `pr`        | `ms`, `me`, `ps`, `pe`                     |
| `text-align: left/right`      | `text-align: start/end`                    |
| `margin-left`, `margin-right` | `margin-inline-start`, `margin-inline-end` |
| `flex-direction: row-reverse` | `dir` attribute or logical properties      |

Mantine shorthand: `ms` = margin-inline-start, `me` = margin-inline-end, `ps` = padding-inline-start,
`pe` = padding-inline-end.

## Dark mode

Use Mantine's `light-dark()` utility or `useMantineColorScheme`, and only with colours that already
come from the theme — never introduce a literal colour or a shade string for one scheme.

```tsx
// Correct
<Box bg="var(--mantine-color-body)">

// Wrong — scheme branch with hardcoded Mantine shades
<Box bg={theme.colorScheme === 'dark' ? 'dark.6' : 'gray.0'}>
```
