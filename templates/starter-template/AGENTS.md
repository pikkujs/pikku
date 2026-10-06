# Building in this project

## Personas

`packages/functions/src/personas.ts` declares this app's people, primary role first — the
person who uses it daily, not the one who administers it. The shipped `visitor` is a
placeholder to replace, not to add to: a build that leaves it beside real roles ships a
synthetic health-check user as the person this app is for, and every consumer that takes the
first actor believes it. Removing it is four coordinated edits in one pass — the
`definePersonas` call, `pikku.config.json`, and the two shipped scenarios that name
`actors.visitor` literally, which PKU677 forbids writing generically. Under fabric,
`fabric build-complete` refuses a build that left it and names every edit.

## Routing

Three fixed slots, so a URL means the same thing in every app built from this template:

- **`/api`** — the API. Better Auth lives under `/api/auth/*`.
- **`/app`** — the signed-in application. EVERY screen you build goes under here
  (`/app/orders`, `/app/orders/$orderId`), named to match its route file
  (`app.orders.$orderId.tsx`). The `app.tsx` layout renders the shell and gates everything
  nested under it. The auth screens live at `/app/auth/login`, `/app/auth/signup`, `/app/auth/forgot-password`
  and `/app/auth/reset-password` but must NOT be gated — so their files use TanStack's non-nested
  segment, `app_.auth.login.tsx`: same URL prefix, outside the `app.tsx` layout. Writing
  `app.auth.login.tsx` instead puts the login page behind the gate that redirects to it.

  **A route file with children is a LAYOUT, not a page.** `app.orders.$orderId.tsx` nests
  inside `app.orders.tsx` on the strength of the filename alone, so if `app.orders.tsx` is
  written as an ordinary page it draws no `<Outlet />` and the detail screen mounts
  nowhere — the URL still returns 200 and still renders the list. Put the list in
  `app.orders.index.tsx` and let `app.orders.$orderId.tsx` be its sibling, or keep
  `app.orders.tsx` and have it render `<Outlet />` and nothing else.

  **The auth gate is `beforeLoad`, never a hook.** `app.tsx` sets `ssr: false` and
  `beforeLoad: requireAuthentication` (`@/lib/auth-gate`), which throws `redirect` before the
  route mounts; the auth screens use `redirectIfAuthenticated` the same way. A `useEffect`
  gate runs after the first render, so a signed-out visitor sees the app shell and then a
  redirect. `ssr: false` is required with it: the session cookie is host-only on the API
  origin, so the SSR worker cannot read it.

  **An audience gets its OWN app.** People on the same side of the counter — a mechanic, the
  counter staff, the accountant — share ONE app and differ by nav and by which functions their
  role permits. People on the other side of it — a customer, a supplier, a patient — get their
  own frontend, created with `fabric new-app --slug <slug> --serves <group> --personas <ids>`
  and served at `/_frontend/<slug>/`. They sign up differently (a customer self-serves; staff
  are provisioned), so they cannot share a login screen. Within one app there is no audience
  routing and no landing redirect: `/app` is the home for everyone who can sign into it, and a
  role that only changes which BUTTONS appear is a permission, enforced in the function's
  `permissions` field.

- **`/`** — the marketing homepage. Everything outside `/app` is brand register. The starter has none, so `/` redirects to `/app` and the
  app's own gate forwards a signed-out visitor to `/app/auth/login`. Building a landing page means
  replacing `src/routes/index.tsx` with a component; nothing else changes.

## Navigation and the phone

`useNavItems()` in `src/components/layout/nav.tsx` is the ONE place navigation is defined. Add
a screen there and it appears in the desktop sidebar and in whichever phone navigation the
shell mounts. Destinations only — account, theme, colour scheme, language and sign-out live in
`<ShellSettings />`, the account menu every shell mounts at the foot of its nav.

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

An app with a `components.json` is a shadcn app: add components with the shadcn CLI, from the
app's directory — `npx shadcn@latest add <name>`. Pikku has no installer of its own, and the
builder, prototypes and artifacts all use this one route. The CLI copies the source into
`src/components/ui`, so it is yours to edit, and what it copies is not ready to ship:

- **Every string comes from messages.** Upstream components and blocks carry literal text
  (a placeholder, a "Close" label, an aria-label). Replace each with `m.<key>()` from
  `@/i18n/messages` and add the key to `messages/en.json`; a literal string in a screen is a
  bug in every other locale.
- **Direction is logical, never physical.** Use `ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`,
  `text-start`/`text-end`, `rounded-s`/`rounded-e` and `border-s`/`border-e`, not
  `ml-`/`mr-`, `pl-`/`pr-`, `left-`/`right-`, `text-left`/`text-right`, `rounded-l`/`rounded-r`
  and `border-l`/`border-r`. A physical class is wrong in right-to-left locales (Arabic).

Do both straight after the CLI runs, in the same change that adds the component.
