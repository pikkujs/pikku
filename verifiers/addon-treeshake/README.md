# Addon Tree-Shaking Verifier

Verifies per-unit deploy codegen against `@pikku/templates-function-addon`:

- a unit that never touches the addon does not import its bootstrap
- a unit using an addon function imports the bootstrap, and its
  `requiredSingletonServices` flags only the parent services that function's
  meta declares — not the addon's full `requiredParentServices`
- an addon function using an addon-created service (the monolithic services
  factory) falls back to the full parent set
- `ref('ns:fn')`-wired routes keep the addon and aggregate the target
  function's services

Run with `yarn test` (codegen → typecheck → filtered-unit assertions).
