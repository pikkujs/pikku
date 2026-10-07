# Frontend rules

- UI is Tailwind v4 over shadcn components in `apps/app/src/components/ui`. Use the component for the job;
  add a missing one with `pikku components add <Name>` (never `bunx shadcn add`).
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
- `pikku mocks diff`: lists what is still mocked. A mock with no function is "added" and that is expected while you build; nothing may be `invalid`, and a mock for an existing function must still match it.
- `pikku mocks check`: no stub is on a function that already fits and no plain hook calls a missing function. A stub with no flag is expected while you build.
- `pikku validate`.

## Data: real, mocked, stubbed

`api.gen.ts` lists the RPCs that exist. Call those with `usePikkuQuery` / `usePikkuMutation`; they use the function's own types.

If no function fits the screen, mock it: add `.mocks/<rpc.name>/<scenario>.json` and `<scenario>.meta.json` (one scenario has `default: true`; add an empty and an error one) and call `usePikkuQueryStub('rpc:name')` / `usePikkuMutationStub`, imported from `@project/functions-sdk/pikku/api.gen` like `usePikkuQuery` (see `components/RemindersPreview.tsx`). A stub always answers from the mock and its output type is inferred from the mock files. Use a stub only when the function's types are not enough: either no function exists, or the shape you need differs from its output. If the mock already fits the function, use `usePikkuQuery`.

Write stubs with no `{ featureFlag }` while you build, and never borrow a flag that belongs to something else. A stub with no flag works in development but cannot be published, which is how the owner sees what is not built yet. Publishing needs `usePikkuQueryStub('rpc:name', { featureFlag: 'flag' })` with the flag declared in the project.

Making a screen real: `pikku mocks check` lists every stub. For each, implement the function so its output matches the mock, then replace the stub with `usePikkuQuery`. `pikku mocks diff` confirms the mock and function agree.

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
