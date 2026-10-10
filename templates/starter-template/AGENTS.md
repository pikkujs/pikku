# Frontend rules

- UI is Tailwind v4 over shadcn components in `apps/app/src/components/ui`. Use the component for the job;
  add a missing one from `apps/app` with `npx shadcn@latest add <name>`, then make it lint-clean (strings through `m.*()`, flow-relative classes).
- Every colour, radius and font comes from `packages/theme/theme.css` tokens. Change the look with
  `pikku theme apply` (it also loads the Google Fonts it names), never by editing `theme.css` or adding literals.
- After any UI change run `bun run lint` in `apps/app` and fix every error. `@shadcn/lint` names what to use
  instead; do not add disable comments.
- User-visible strings go through `m.*()` from `@/i18n/messages`; `react/jsx-no-literals` enforces it.
- Layout classes are flow-relative (`ms-*`, `pe-*`, `start-*`, `text-start`) so RTL works.
- Dates are formatted with dayjs before rendering.

## Checks before you stop

Run these and fix every failure; they are the rules, there is no other rulebook.

- `pikku all`, then `bun run tsc` in `apps/app`. Fix every error; never say the checks pass while `tsc` fails.
- `bun run lint` in `apps/app` (shadcn rules, and `react/jsx-no-literals` for strings that skipped `m.*()`).
- `pikku i18n list`: no locale is missing a key or has anything left to translate (`pikku i18n sync` adds missing keys).
- `pikku validate`.

## First run

`bun install` (the `bunfig.toml` pins the hoisted linker; the isolated one installs two copies of vite and every
page 404s silently), then `pikku all`, `pikku db generate`, `pikku db migrate`, then `bun run dev`.
Dev needs a restart after adding a function.

## Routing

Three fixed slots: `/api` (the API, Better Auth under `/api/auth/*`), `/app` (every signed-in screen,
`app.orders.$orderId.tsx` style files under `apps/app/src/routes`) and `/` (the marketing page; the starter
redirects to `/app`). The `app.tsx` layout gates everything nested under it with `beforeLoad`; auth screens use the
non-nested `app_.auth.login.tsx` form so they stay outside the gate. A route file with children is a layout and must
render `<Outlet />`; put a list in `app.orders.index.tsx`.

## Navigation and the phone

`useNavItems()` in `src/components/layout/nav.tsx` is the one place navigation is defined; add a screen there and it
shows in the desktop sidebar (`NavList`) and in the phone's bottom bar (`MobileTabBar`), both mounted by `AppShell`.

## Personas

`packages/functions/src/personas.ts` declares the people. Replace the shipped `visitor` placeholder in four edits:
the `definePersonas` call, `pikku.config.json` (`scenarios` personas), and the two shipped scenarios
(`test/scenarios/every-page-loads`, `signed-in-actor-reaches-the-app`), which name `actors.visitor` literally
(`sed -i '' 's/actors.visitor/actors.<id>/g' packages/functions/test/scenarios/*.ts`).

## Scenarios

Inline zod schemas on functions must be exported consts (PKU489). Local actor sign-in grants no persona roles; a
scoped RPC 403s until the role row exists (see the pikku-scenario skill).
