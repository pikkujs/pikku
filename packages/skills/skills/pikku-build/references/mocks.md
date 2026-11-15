# Functions declared but not built yet (`mock: true`)

Read this when a screen needs a function that is not built yet, or when a plan declares the functions first so the front end and the back end can be built side by side.

## Declare the function

A function with its real `input` and `output` types and `mock: true`, and no `func`:

```ts
export const listBookings = pikkuSessionlessFunc({
  input: ListBookingsInput,
  output: ListBookingsOutput,
  mock: true,
})
```

`mock: true` means: declared, not built. It cannot have a `func`. The framework knows it is fake: `pikku info functions --mock` lists these functions, `pikku validate` refuses to publish while one is left, and calling one on a real backend fails with "is mocked". Wire and expose it like any other function.

## Give it data

Mock data is plain files: `.mocks/<function name, : as .>/<scenario>.json` is exactly what the function answers, and `<scenario>.meta.json` beside it holds `state` (`healthy`, `empty`, `error` or `slow`), `status` for an error, and `delayMs` for a slow one. `healthy` is the default; give every list an `empty` too and every function that can fail an `error`. Keep it short: a few believable records are enough. `pikku mocks diff` checks the files against the function and lists what is unused.

## The screen does not know

Screens always call `usePikkuQuery('rpc:name')` and `usePikkuMutation('rpc:name')`. Never a stub hook and never a mock branch in a component. Mock mode is a different client given to the app: with `VITE_MOCK=1` the app builds `createMockPikku()` from `mocks.gen.ts` (all calls answered from `.mocks`), with `VITE_MOCK=flagged` only the functions marked `mock: true` are answered from it and the rest go to the real backend. A story or a scene picks a scenario with `setMockScenario('bookings.list', 'empty')` or `setMockScenarios({ 'bookings.list': 'error' })`, imported from `mocks.gen.ts`.

## Making it real

Write the `func` so its output matches the mock, delete `mock: true`, run `pikku all`. The mock files stay: mock mode and stories keep using them. A screen needs no change.

## Screens built on mocks

The screens are the real app's: real components, `m.*()` for every string, the theme tokens. Only the data is sample. Make it look lived in: real copy and believable names, not "Item 1".
