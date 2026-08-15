// @pikku/mantine/dev — development-only controls.
//
// Deliberately NOT part of `@pikku/mantine/core`: that entry point's contract is
// "drop-in alias for @mantine/core" (it is `export * from '@mantine/core'` plus
// i18n type overrides, and `pikku fabric validate` enforces apps import through
// it). Exporting a component that has no `@mantine/core` counterpart from there
// would break the alias story, so dev-only controls get their own entry point.
export { DevActorSwitcher } from './DevActorSwitcher.js'
export type { DevActorSwitcherProps } from './DevActorSwitcher.js'
