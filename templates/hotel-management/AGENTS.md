# Building in this project

## Routing

Three fixed slots, so a URL means the same thing in every app built from this template:

- **`/api`** — the API. Better Auth lives under `/api/auth/*`.
- **`/app`** — the signed-in application. EVERY screen you build goes under here
  (`/app/orders`, `/app/orders/$orderId`), named to match its route file
  (`app.orders.$orderId.tsx`). The `app.tsx` layout renders the shell and gates everything
  nested under it. The auth screens live at `/app/login`, `/app/signup`, `/app/forgot-password`
  and `/app/reset-password` but must NOT be gated — so their files use TanStack's non-nested
  segment, `app_.login.tsx`: same URL prefix, outside the `app.tsx` layout. Writing
  `app.login.tsx` instead puts the login page behind the gate that redirects to it.
- **`/`** — the marketing homepage. Everything outside `/app` is brand register. The starter has none, so `/` redirects to `/app` and the
  app's own gate forwards a signed-out visitor to `/app/login`. Building a landing page means
  replacing `src/routes/index.tsx` with a component; nothing else changes.

## Navigation and the phone

`useNavItems()` in `src/components/layout/nav.tsx` is the ONE place navigation is defined. Add
a screen there and it appears in the desktop sidebar and in whichever phone navigation the
shell mounts.

Below `sm` the sidebar is gone and one of two components replaces it — never both:

- **`<MobileTabBar />` — the default.** A foot bar of destination tabs, within thumb reach,
  overflowing past four tabs into a More sheet. Keep the `<Box hiddenFrom="sm">` spacer beside
  it in the shell, or the last row of every page hides under the bar.
- **`<MobileNavDrawer />`** — a burger in a phone-only header. Swap to it when the nav is
  long or hierarchical, when the foot belongs to the screen itself (a composer, a media
  transport), or for a canvas tool that wants every pixel. It needs
  `header={{ height: { base: MOBILE_HEADER_HEIGHT, sm: 0 } }}` on the shell plus a
  `<AppShell.Header hiddenFrom="sm">` to sit in, and no foot spacer.

## Components

A reusable **component kit** is available via `fabric scaffold --name component-kit` — lay it
down ONCE into `apps/app/src/components/`, then import each from `@/components/<Name>`.
**Compose these instead of hand-rolling UI** — it is faster, consistent, and already themed.

## Available components

Layout:

- `PageHeader` — page title + optional description + right-aligned `actions` slot. Use one per page.
- `Panel` — bordered section with an optional titled header (`title`, `description`, `actions`). The workhorse container.
- `StatCard` — a single metric tile (`label`, `value`, optional `icon`, `color`).
- `StatGrid` — responsive row of `StatCard`s; pass `stats={[{label, value, icon}]}`.

Data (feed these the output of an RPC you implement):

- `DataTable` — generic typed table. Props: `columns` (`{key, header, render?, align?}`), `rows`, `rowKey`, optional `loading`/`empty`/`onRowClick`. Implement a `listX` RPC and pass its rows.
- `BarChart` — dependency-free horizontal bars from `data={[{label, value, color?}]}`. Good for status/count breakdowns from a stats RPC.

State (already used by the app):

- `EmptyState`, `PageLoader`, `NotFoundState`, `ServerErrorState`, `UserCard`.

## How to build a feature page

1. Implement the backend RPCs (`pikku-rpc` / `pikku-kysely` skills): a `listX` and any mutations, with zod input/output and `auth: true`. Scope rows to the signed-in user (`where('userId','=',session.userId)`).
2. Fetch with `usePikkuQuery('listX', {})` and mutate with `usePikkuMutation('createX')` (from `@project/functions-sdk/pikku/api.gen`).
3. Build the page by composing the kit from `@/components/<Name>`: `PageHeader` + `Panel` + `DataTable`/`StatGrid`/`BarChart`. Pass i18n strings (`m.key()`) into the component props.

These are props-only components — they never fetch data themselves. You own the page that wires RPC data into them.
