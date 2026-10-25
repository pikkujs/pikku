---
'@pikku/code-edit': patch
'@pikku/cli': patch
'@pikku/skills': patch
---

`pikku ui theme apply --mode dark` derives every token for a dark design: `--page`/`--ink` are the dark ground and its text, and card, muted, border, input, the `-foreground` tokens and ring are derived for it, written to both `:root` and `.dark` with `color-scheme: dark`. Derived foregrounds are now contrast-checked against their fill on the light path too (no more white on a light primary), and apply prints a contrast report. Default light output is unchanged.
