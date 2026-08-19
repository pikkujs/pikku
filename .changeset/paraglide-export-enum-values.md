---
'@pikku/paraglide': patch
---

fix(paraglide): export the enum generators, not just their types

The package barrel re-exported `GenerateEnumsOptions`, `EnumGroup` and `DbEnum`
as types only, so `dist/esm/index.js` compiled down to `export {}` and the
package had no runtime surface at all. Anything importing `generateEnumsSource`
or `parseDbEnums` from `@pikku/paraglide` died at load with "does not provide an
export named 'generateEnumsSource'", and the `exports` map offers no deep path
to reach them another way — the only consumers that worked were the bundled
`./vite` plugin and the `paraglide-enums` bin, which import the module directly.
The barrel now exports `generateEnumsSource`, `parseDbEnums` and
`collectEnumGroups` alongside the existing types.
