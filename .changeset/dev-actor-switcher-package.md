---
'@pikku/react': patch
'@pikku/mantine': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

feat(react,mantine): ship the dev actor switcher instead of making every app copy it

The dev-only "Sign in as …" control — one click signs in as a declared scenario
persona, no password — was hand-copied into every app that needed it, because
`pikku fabric validate` requires any frontend with a login screen to have one.
The `devActors()` / `signInAsActor()` pair was byte-identical everywhere it
landed, including the `import.meta.env.DEV` gate that keeps the shared secret out
of production bundles. That is not a thing each app should be re-deriving from a
copy-paste.

Split along the dependency line:

- `@pikku/react` gains `useDevActors()`, `signInAsActor()` and `parseDevActors()`.
  UI-free, so it stays inside the package's react-only dependency budget.
- `@pikku/mantine/dev` gains `<DevActorSwitcher />`, built on that hook. It is a
  new entry point rather than part of `/core`, because `/core`'s contract is
  "drop-in alias for `@mantine/core`" and exporting a component Mantine has no
  counterpart for would break it.

The component takes `onSignedIn` rather than depending on a router, and the
actors/secret are passed in rather than read from env — how env is spelled is a
bundler fact (`import.meta.env.VITE_*` vs `process.env.NEXT_PUBLIC_*`), and a
package that guesses gets it wrong for half its consumers.

The skills document it in the four places an agent would look: `pikku-better-auth`
for the `actor` plugin's endpoint (which had only `/dev/quick-login` before, and
so sent agents to the wrong control), `pikku-scenario` for the actor list being
the same one a human signs in through, `pikku-react` for the hook, and
`pikku-fabric` for the validate rule that requires it.

`fabric validate` now also accepts a `useDevActors()` call site as evidence the
control is wired, so apps that want their own UI on the shared logic pass. The
hand-rolled shape still passes too — nothing existing breaks. Its fix text no
longer tells you to hand-write the helper, which would have become wrong advice
the day this shipped.
